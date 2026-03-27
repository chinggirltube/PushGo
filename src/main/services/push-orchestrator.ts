import { PushOrchestrator, PushProgressEvent, PushRunMeta, PushRunParams } from "../../shared/contracts";
import { createAppError } from "../errors";
import { SessionAuthService } from "./auth-service";
import { CliGitService } from "./git-service";

type ProgressReporter = (event: PushProgressEvent) => void;

export class DefaultPushOrchestrator implements PushOrchestrator {
  private lastMeta: PushRunMeta = {
    commitStatus: "committed",
    fallbackToMaster: false
  };

  constructor(
    private readonly gitService: CliGitService,
    private readonly authService: SessionAuthService
  ) {}

  async run(params: PushRunParams): Promise<void> {
    await this.execute(params);
  }

  async runWithProgress(params: PushRunParams, onProgress?: ProgressReporter): Promise<void> {
    await this.execute(params, onProgress);
  }

  consumeLastMeta(): PushRunMeta {
    const snapshot = { ...this.lastMeta };
    this.lastMeta = {
      commitStatus: "committed",
      fallbackToMaster: false
    };
    return snapshot;
  }

  private async execute(params: PushRunParams, onProgress?: ProgressReporter): Promise<void> {
    if (!params.projectPath) {
      throw createAppError("APP_FOLDER_INVALID");
    }

    this.lastMeta = {
      commitStatus: "committed",
      fallbackToMaster: false
    };

    const token = this.authService.getToken(params.platform, { repoUrl: params.repoUrl });
    this.gitService.setAuthContext(params.platform, token);

    try {
      onProgress?.({ stage: "prepare", message: "准备仓库" });
      const isRepo = await this.gitService.isRepo(params.projectPath);
      if (!isRepo) {
        await this.gitService.initRepo(params.projectPath);
      }
      await this.gitService.ensureUserConfig(params.projectPath);

      onProgress?.({ stage: "collect", message: "整理文件" });
      await this.gitService.addAll(params.projectPath);

      onProgress?.({ stage: "commit", message: "提交变更" });
      const commitStatus = await this.gitService.commit(params.projectPath, `PushGo Auto Commit ${new Date().toISOString()}`);

      onProgress?.({ stage: "upload", message: "上传到远端" });
      await this.gitService.setRemote(params.projectPath, params.repoUrl);
      await this.gitService.push(params.projectPath);

      const pushMeta = this.gitService.consumePushMeta();
      this.lastMeta = {
        commitStatus,
        fallbackToMaster: pushMeta.fallbackToMaster
      };
    } finally {
      this.gitService.clearAuthContext();
    }
  }
}
