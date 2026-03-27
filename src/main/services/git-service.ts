import { Buffer } from "node:buffer";
import { stat } from "node:fs/promises";
import { AppErrorPayload, GitService, Platform, PushRunMeta } from "../../shared/contracts";
import { createAppError, inferGitPushError, isGitNotFound } from "../errors";
import { CommandExecutionError, runCommand } from "../utils/run-command";

type AuthContext = {
  platform: Platform;
  token: string | null;
};

export class CliGitService implements GitService {
  private authContext: AuthContext | null = null;
  private pushMeta: PushRunMeta = {
    commitStatus: "committed",
    fallbackToMaster: false
  };

  async checkInstalled(): Promise<boolean> {
    try {
      await runCommand("git", ["--version"], { timeoutMs: 10_000 });
      return true;
    } catch (error) {
      if (error instanceof CommandExecutionError) {
        const output = `${error.stdout}\n${error.stderr}\n${error.message}`;
        if (isGitNotFound(output)) {
          return false;
        }
      }

      return false;
    }
  }

  async checkCredentialHelperReadiness(): Promise<AppErrorPayload | null> {
    const helpers = await this.readCredentialHelpers();
    if (this.hasPopupCapableHelper(helpers)) {
      return null;
    }

    const autoHelper = await this.detectAutoCredentialHelper();
    if (autoHelper) {
      const configured = await this.trySetGlobalCredentialHelper(autoHelper);
      if (configured) {
        return null;
      }

      return createAppError("APP_GIT_HELPER_MISSING", {
        message: "检测到凭据助手组件，但自动配置失败。请手动启用 Git Credential Manager 后重试。"
      }).payload;
    }

    if (helpers.length > 0) {
      return createAppError("APP_GIT_HELPER_UNSUPPORTED", {
        message: `当前凭据助手不支持授权弹窗（${helpers.join(", ")}）。请切换到 Git Credential Manager。`
      }).payload;
    }

    return createAppError("APP_GIT_HELPER_MISSING").payload;
  }

  async isRepo(projectPath: string): Promise<boolean> {
    await this.ensureProjectDir(projectPath);

    try {
      const result = await runCommand("git", ["rev-parse", "--is-inside-work-tree"], {
        cwd: projectPath,
        timeoutMs: 15_000
      });
      return result.stdout.trim() === "true";
    } catch {
      return false;
    }
  }

  async initRepo(projectPath: string): Promise<void> {
    await this.ensureProjectDir(projectPath);

    try {
      await runCommand("git", ["init"], { cwd: projectPath, timeoutMs: 15_000 });
    } catch {
      throw createAppError("GIT_INIT_FAILED");
    }
  }

  async ensureUserConfig(projectPath: string): Promise<void> {
    await this.ensureProjectDir(projectPath);

    const name = await this.readGitConfig(projectPath, "user.name");
    const email = await this.readGitConfig(projectPath, "user.email");

    if (!name) {
      await runCommand("git", ["config", "user.name", "PushGo User"], {
        cwd: projectPath,
        timeoutMs: 10_000
      });
    }

    if (!email) {
      await runCommand("git", ["config", "user.email", "pushgo@local.invalid"], {
        cwd: projectPath,
        timeoutMs: 10_000
      });
    }
  }

  async addAll(projectPath: string): Promise<void> {
    await this.ensureProjectDir(projectPath);
    await runCommand("git", ["add", "-A"], { cwd: projectPath, timeoutMs: 20_000 });
  }

  async commit(projectPath: string, message: string): Promise<"committed" | "no_changes"> {
    await this.ensureProjectDir(projectPath);

    const hasChanges = await this.hasStagedChanges(projectPath);
    if (!hasChanges) {
      this.pushMeta.commitStatus = "no_changes";
      return "no_changes";
    }

    try {
      await runCommand("git", ["commit", "-m", message], { cwd: projectPath, timeoutMs: 20_000 });
      this.pushMeta.commitStatus = "committed";
      return "committed";
    } catch (error) {
      if (error instanceof CommandExecutionError) {
        const detail = `${error.stdout}\n${error.stderr}`.toLowerCase();
        if (
          detail.includes("nothing to commit") ||
          detail.includes("no changes added") ||
          detail.includes("working tree clean")
        ) {
          this.pushMeta.commitStatus = "no_changes";
          return "no_changes";
        }

        const compact = this.compactDetail(this.composeCommandErrorDetail(error));
        if (compact) {
          throw createAppError("UNKNOWN", {
            message: `提交变更失败（原始信息：${compact}）`
          });
        }
      }

      throw createAppError("UNKNOWN");
    }
  }

  async setRemote(projectPath: string, repoUrl: string): Promise<void> {
    await this.ensureProjectDir(projectPath);

    try {
      const remotes = await runCommand("git", ["remote"], { cwd: projectPath, timeoutMs: 10_000 });
      const hasOrigin = remotes.stdout
        .split("\n")
        .map((item) => item.trim())
        .includes("origin");

      if (hasOrigin) {
        await runCommand("git", ["remote", "set-url", "origin", repoUrl], {
          cwd: projectPath,
          timeoutMs: 10_000
        });
      } else {
        await runCommand("git", ["remote", "add", "origin", repoUrl], {
          cwd: projectPath,
          timeoutMs: 10_000
        });
      }
    } catch {
      throw createAppError("GIT_REMOTE_SET_FAILED");
    }
  }

  async push(projectPath: string): Promise<void> {
    await this.ensureProjectDir(projectPath);
    this.pushMeta.fallbackToMaster = false;

    const helpers = await this.ensureCredentialHelperReady(projectPath);
    await this.ensureCredentialStoreReady(projectPath, helpers);

    const authArgs = this.buildAuthArgs();
    const pushEnv = this.buildPushEnv();

    await this.primeRemoteAuth(projectPath, pushEnv);

    try {
      await runCommand("git", [...authArgs, "push", "-u", "origin", "HEAD:main"], {
        cwd: projectPath,
        timeoutMs: 120_000,
        env: pushEnv
      });
      return;
    } catch (error) {
      if (this.shouldFallbackToMaster(error)) {
        try {
          await runCommand("git", [...authArgs, "push", "-u", "origin", "HEAD:master"], {
            cwd: projectPath,
            timeoutMs: 120_000,
            env: pushEnv
          });
          this.pushMeta.fallbackToMaster = true;
          return;
        } catch (masterError) {
          throw this.mapPushError(masterError);
        }
      }

      throw this.mapPushError(error);
    }
  }

  setAuthContext(platform: Platform, token: string | null): void {
    this.authContext = { platform, token };
  }

  clearAuthContext(): void {
    this.authContext = null;
  }

  consumePushMeta(): PushRunMeta {
    const snapshot = { ...this.pushMeta };
    this.pushMeta = {
      commitStatus: "committed",
      fallbackToMaster: false
    };
    return snapshot;
  }

  private async ensureProjectDir(projectPath: string): Promise<void> {
    if (!projectPath) {
      throw createAppError("APP_FOLDER_INVALID");
    }

    try {
      const info = await stat(projectPath);
      if (!info.isDirectory()) {
        throw createAppError("APP_FOLDER_INVALID");
      }
    } catch {
      throw createAppError("APP_FOLDER_INVALID");
    }
  }

  private async readGitConfig(projectPath: string, key: string): Promise<string | null> {
    try {
      const result = await runCommand("git", ["config", "--get", key], {
        cwd: projectPath,
        timeoutMs: 10_000
      });
      const value = result.stdout.trim();
      return value || null;
    } catch {
      return null;
    }
  }

  private async hasStagedChanges(projectPath: string): Promise<boolean> {
    try {
      await runCommand("git", ["diff", "--cached", "--quiet"], {
        cwd: projectPath,
        timeoutMs: 10_000
      });
      return false;
    } catch (error) {
      if (error instanceof CommandExecutionError && this.isExitCode(error.code, 1)) {
        return true;
      }

      throw createAppError("UNKNOWN", {
        message: "检查变更状态失败，请重试"
      });
    }
  }

  private buildAuthArgs(): string[] {
    if (!this.authContext?.token) {
      return [];
    }

    const username = this.authContext.platform === "github" ? "x-access-token" : "oauth2";
    const credential = Buffer.from(`${username}:${this.authContext.token}`).toString("base64");
    const header = `http.extraheader=AUTHORIZATION: Basic ${credential}`;

    return ["-c", header];
  }

  private buildPushEnv(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      // 禁止回落到终端用户名/密码输入，避免出现“卡在命令行提示”的体验。
      GIT_TERMINAL_PROMPT: "0",
      // GUI 进程中强制允许 GCM 交互，避免被判定为非交互模式。
      GCM_INTERACTIVE: "always"
    };
  }

  private async ensureCredentialHelperReady(projectPath: string): Promise<string[]> {
    if (this.authContext?.token) {
      return [];
    }

    const helpers = await this.readCredentialHelpers(projectPath);
    if (this.hasPopupCapableHelper(helpers)) {
      return helpers;
    }

    const autoHelper = await this.detectAutoCredentialHelper();
    if (autoHelper) {
      await this.setCredentialHelper(projectPath, autoHelper);
      return [autoHelper];
    }

    if (helpers.length > 0) {
      throw createAppError("GIT_PUSH_AUTH_FAILED", {
        message: `当前凭据助手不支持浏览器授权弹窗（${helpers.join(", ")}）。请切换到 Git Credential Manager 后重试。`
      });
    }

    throw createAppError("GIT_PUSH_AUTH_FAILED", {
      message: "未检测到 Git 凭据助手，无法弹出授权窗口。请先安装并启用 Git Credential Manager 后重试。"
    });
  }

  private async readCredentialHelpers(projectPath?: string): Promise<string[]> {
    try {
      const result = await runCommand("git", ["config", "--get-all", "credential.helper"], {
        cwd: projectPath,
        timeoutMs: 10_000
      });

      return result.stdout
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  private async detectAutoCredentialHelper(): Promise<string | null> {
    if (await this.canRunGitCredentialManager("credential-manager")) {
      return "manager";
    }

    if (await this.canRunGitCredentialManager("credential-manager-core")) {
      return "manager-core";
    }

    return null;
  }

  private async canRunGitCredentialManager(command: "credential-manager" | "credential-manager-core"): Promise<boolean> {
    if (await this.canRunCommand("git", [command, "--version"])) {
      return true;
    }

    const helperCommand = command === "credential-manager" ? "git-credential-manager" : "git-credential-manager-core";
    for (const candidate of this.commandCandidates(helperCommand)) {
      if (await this.canRunCommand(candidate, ["--version"])) {
        return true;
      }
    }

    return false;
  }

  private async canRunCommand(command: string, args: string[]): Promise<boolean> {
    try {
      await runCommand(command, args, {
        timeoutMs: 10_000
      });
      return true;
    } catch {
      return false;
    }
  }

  private commandCandidates(base: string): string[] {
    if (process.platform === "win32") {
      return [base, `${base}.exe`];
    }

    return [base];
  }

  private hasPopupCapableHelper(helpers: string[]): boolean {
    return helpers.some((helper) => /(manager|credential-manager|oauth)/i.test(helper));
  }

  private async setCredentialHelper(projectPath: string, helper: string): Promise<void> {
    try {
      await runCommand("git", ["config", "credential.helper", helper], {
        cwd: projectPath,
        timeoutMs: 10_000
      });
    } catch {
      throw createAppError("GIT_PUSH_AUTH_FAILED", {
        message: "自动配置 Git 凭据助手失败，请手动安装或启用 Git Credential Manager 后重试。"
      });
    }
  }

  private async ensureCredentialStoreReady(projectPath: string, helpers: string[]): Promise<void> {
    if (this.authContext?.token) {
      return;
    }

    if (!this.usesGcmHelper(helpers)) {
      return;
    }

    const envStore = process.env.GCM_CREDENTIAL_STORE?.trim();
    if (envStore && !this.isCredentialStoreSupported(envStore)) {
      throw createAppError("GIT_PUSH_AUTH_FAILED", {
        message: `当前环境变量 GCM_CREDENTIAL_STORE=${envStore} 与当前系统不兼容，请移除或改为 ${this.preferredCredentialStore()} 后重试。`
      });
    }

    const configuredStore = await this.readConfiguredCredentialStore(projectPath);
    if (configuredStore && this.isCredentialStoreSupported(configuredStore)) {
      return;
    }

    const configured = await this.trySetCredentialStore(projectPath, this.preferredCredentialStore());
    if (!configured) {
      throw createAppError("GIT_PUSH_AUTH_FAILED", {
        message: "检测到 Git Credential Manager，但凭据存储未配置且自动修复失败。请配置 credential.credentialStore 后重试。"
      });
    }
  }

  private usesGcmHelper(helpers: string[]): boolean {
    return helpers.some((helper) => /(manager|credential-manager)/i.test(helper));
  }

  private isCredentialStoreSupported(store: string): boolean {
    const normalized = store.trim().toLowerCase();
    if (!normalized) {
      return false;
    }

    if (process.platform === "win32" && normalized === "cache") {
      return false;
    }

    return true;
  }

  private preferredCredentialStore(): string {
    if (process.platform === "win32") {
      return "wincredman";
    }

    if (process.platform === "darwin") {
      return "keychain";
    }

    return "cache";
  }

  private async readConfiguredCredentialStore(projectPath: string): Promise<string | null> {
    const localStore = await this.readGitConfig(projectPath, "credential.credentialStore");
    if (localStore) {
      return localStore;
    }

    return this.readGlobalGitConfig("credential.credentialStore");
  }

  private async readGlobalGitConfig(key: string): Promise<string | null> {
    try {
      const result = await runCommand("git", ["config", "--global", "--get", key], {
        timeoutMs: 10_000
      });
      const value = result.stdout.trim();
      return value || null;
    } catch {
      return null;
    }
  }

  private async trySetCredentialStore(projectPath: string, store: string): Promise<boolean> {
    try {
      await runCommand("git", ["config", "credential.credentialStore", store], {
        cwd: projectPath,
        timeoutMs: 10_000
      });
      return true;
    } catch {
      return false;
    }
  }

  private async primeRemoteAuth(projectPath: string, env: NodeJS.ProcessEnv): Promise<void> {
    if (this.authContext?.token) {
      return;
    }

    try {
      // 在正式 push 前预热一次远端鉴权，尽量提前触发凭据助手弹窗。
      await runCommand("git", ["ls-remote", "--heads", "origin"], {
        cwd: projectPath,
        timeoutMs: 60_000,
        env
      });
    } catch (error) {
      throw this.mapPushError(error);
    }
  }

  private async trySetGlobalCredentialHelper(helper: string): Promise<boolean> {
    try {
      await runCommand("git", ["config", "--global", "credential.helper", helper], {
        timeoutMs: 10_000
      });
      return true;
    } catch {
      return false;
    }
  }

  private shouldFallbackToMaster(error: unknown): boolean {
    if (!(error instanceof CommandExecutionError)) {
      return false;
    }

    const detail = `${error.stdout}\n${error.stderr}`.toLowerCase();

    if (
      detail.includes("authentication failed") ||
      detail.includes("could not read username") ||
      detail.includes("access denied") ||
      detail.includes("non-fast-forward") ||
      detail.includes("failed to push some refs")
    ) {
      return false;
    }

    return detail.includes("main") || detail.includes("refs/heads/main") || detail.includes("src refspec main");
  }

  private mapPushError(error: unknown) {
    if (error instanceof CommandExecutionError) {
      const detail = this.composeCommandErrorDetail(error);
      const mapped = inferGitPushError(detail);
      const compact = this.compactDetail(detail);

      if (compact) {
        console.error(`[PushGo][GitService][push][${mapped.payload.code}]`, compact);
      }

      if (mapped.payload.code !== "UNKNOWN") {
        if (compact) {
          return {
            ...mapped.payload,
            message: `${mapped.payload.message}（原始信息：${compact}）`
          };
        }

        return mapped;
      }

      if (compact) {
        console.error("[PushGo][GitService][push] unknown command error:", compact);
        return createAppError("UNKNOWN", {
          message: `推送失败（原始信息：${compact}）`
        });
      }

      return mapped;
    }

    console.error("[PushGo][GitService][push] unknown non-command error:", error);
    return createAppError("UNKNOWN");
  }

  private compactDetail(detail: string): string {
    return detail
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 220);
  }

  private isExitCode(code: number | string | null, expected: number): boolean {
    if (typeof code === "number") {
      return code === expected;
    }

    if (typeof code === "string") {
      const parsed = Number.parseInt(code, 10);
      return Number.isFinite(parsed) && parsed === expected;
    }

    return false;
  }

  private composeCommandErrorDetail(error: CommandExecutionError): string {
    const raw = [error.stderr, error.stdout, error.message]
      .filter(Boolean)
      .join("\n");

    return this.redactSensitive(raw);
  }

  private redactSensitive(content: string): string {
    return content
      .replace(/(authorization:\s*basic\s+)[a-z0-9+/=]+/gi, "$1[REDACTED]")
      .replace(/(https?:\/\/[^:\s/]+:)[^@\s]+@/gi, "$1[REDACTED]@");
  }
}
