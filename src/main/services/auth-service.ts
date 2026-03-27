import http from "node:http";
import { randomBytes } from "node:crypto";
import { AddressInfo } from "node:net";
import { shell } from "electron";
import { AuthService, Platform } from "../../shared/contracts";
import { createAppError } from "../errors";

const CALLBACK_PATH = "/oauth/callback";
const AUTH_TIMEOUT_MS = 120_000;
const TOKEN_TIMEOUT_MS = 20_000;
const DEFAULT_GITEA_BASE_URL = "https://gitea.com";
const DEFAULT_GITEA_SCOPE = "write:repository";

type OAuthConfig = {
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  clientIdEnv: string;
  clientSecretEnv: string;
};

type AuthOptions = {
  repoUrl?: string;
};

const OAUTH_CONFIG_BASE: Record<Exclude<Platform, "gitea">, OAuthConfig> = {
  github: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scope: "repo",
    clientIdEnv: "PUSHGO_GITHUB_CLIENT_ID",
    clientSecretEnv: "PUSHGO_GITHUB_CLIENT_SECRET"
  },
  gitee: {
    authorizeUrl: "https://gitee.com/oauth/authorize",
    tokenUrl: "https://gitee.com/oauth/token",
    scope: "projects",
    clientIdEnv: "PUSHGO_GITEE_CLIENT_ID",
    clientSecretEnv: "PUSHGO_GITEE_CLIENT_SECRET"
  }
};

type AuthCodeResult = {
  code: string;
  redirectUri: string;
};

export class SessionAuthService implements AuthService {
  private readonly tokenStore = new Map<string, string>();
  private readonly browserLoginStore = new Set<string>();

  async isLoggedIn(platform: Platform, options?: AuthOptions): Promise<boolean> {
    const sessionKey = this.resolveSessionKey(platform, options?.repoUrl);
    return this.tokenStore.has(sessionKey) || this.browserLoginStore.has(sessionKey);
  }

  async login(platform: Platform, options?: AuthOptions): Promise<void> {
    const sessionKey = this.resolveSessionKey(platform, options?.repoUrl);

    if (!this.hasOAuthCredentials(platform)) {
      // 默认模式：由 git push 触发系统凭据授权链路（如 GCM）。
      this.browserLoginStore.add(sessionKey);
      return;
    }

    const config = this.resolveConfig(platform, options?.repoUrl);
    const state = randomBytes(16).toString("hex");

    const { code, redirectUri } = await this.requestAuthorizationCode(platform, config, state);
    const token = await this.exchangeToken(config, code, redirectUri);

    if (!token) {
      throw createAppError("AUTH_FAILED");
    }

    this.tokenStore.set(sessionKey, token);
    this.browserLoginStore.delete(sessionKey);
  }

  async logout(platform: Platform, options?: AuthOptions): Promise<void> {
    const sessionKey = this.resolveSessionKey(platform, options?.repoUrl);
    this.tokenStore.delete(sessionKey);
    this.browserLoginStore.delete(sessionKey);
  }

  getToken(platform: Platform, options?: AuthOptions): string | null {
    const sessionKey = this.resolveSessionKey(platform, options?.repoUrl);
    return this.tokenStore.get(sessionKey) ?? null;
  }

  private resolveSessionKey(platform: Platform, repoUrl?: string): string {
    if (platform !== "gitea") {
      return platform;
    }

    const origin = this.resolveGiteaBaseUrl(repoUrl).toLowerCase();
    return `gitea:${origin}`;
  }

  private hasOAuthCredentials(platform: Platform): boolean {
    const base = this.getOAuthConfig(platform);
    const clientId = process.env[base.clientIdEnv]?.trim();
    const clientSecret = process.env[base.clientSecretEnv]?.trim();
    return Boolean(clientId && clientSecret);
  }

  private resolveConfig(platform: Platform, repoUrl?: string): OAuthConfig & { clientId: string; clientSecret: string } {
    const base = this.getOAuthConfig(platform, repoUrl);
    const clientId = process.env[base.clientIdEnv]?.trim();
    const clientSecret = process.env[base.clientSecretEnv]?.trim();

    if (!clientId || !clientSecret) {
      throw createAppError("AUTH_FAILED");
    }

    return {
      ...base,
      clientId,
      clientSecret
    };
  }

  private getOAuthConfig(platform: Platform, repoUrl?: string): OAuthConfig {
    if (platform !== "gitea") {
      return OAUTH_CONFIG_BASE[platform];
    }

    const giteaBaseUrl = this.resolveGiteaBaseUrl(repoUrl);
    return {
      authorizeUrl: `${giteaBaseUrl}/login/oauth/authorize`,
      tokenUrl: `${giteaBaseUrl}/login/oauth/access_token`,
      scope: (process.env.PUSHGO_GITEA_SCOPE ?? DEFAULT_GITEA_SCOPE).trim(),
      clientIdEnv: "PUSHGO_GITEA_CLIENT_ID",
      clientSecretEnv: "PUSHGO_GITEA_CLIENT_SECRET"
    };
  }

  private resolveGiteaBaseUrl(repoUrl?: string): string {
    const repoOrigin = this.resolveOriginFromRepoUrl(repoUrl);
    if (repoOrigin) {
      return repoOrigin;
    }

    const raw = (process.env.PUSHGO_GITEA_BASE_URL ?? DEFAULT_GITEA_BASE_URL).trim();
    const withProtocol = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;

    try {
      const parsed = new URL(withProtocol);
      return parsed.origin;
    } catch {
      return DEFAULT_GITEA_BASE_URL;
    }
  }

  private resolveOriginFromRepoUrl(repoUrl?: string): string | null {
    if (!repoUrl) {
      return null;
    }

    try {
      const parsed = new URL(repoUrl.trim());
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return null;
      }

      return parsed.origin;
    } catch {
      return null;
    }
  }

  private async requestAuthorizationCode(
    platform: Platform,
    config: OAuthConfig & { clientId: string; clientSecret: string },
    state: string
  ): Promise<AuthCodeResult> {
    return new Promise((resolve, reject) => {
      const server = http.createServer();
      let settled = false;

      const cleanup = () => {
        if (server.listening) {
          server.close();
        }
      };

      const settle = (fn: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        cleanup();
        fn();
      };

      const timeout = setTimeout(() => {
        settle(() => reject(createAppError("AUTH_CANCELLED")));
      }, AUTH_TIMEOUT_MS);

      server.on("request", (req, res) => {
        const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");

        if (requestUrl.pathname !== CALLBACK_PATH) {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Not Found");
          return;
        }

        const code = requestUrl.searchParams.get("code");
        const returnedState = requestUrl.searchParams.get("state");
        const oauthError = requestUrl.searchParams.get("error");

        if (oauthError === "access_denied") {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<h2>已取消授权</h2><p>你可以返回 PushGo 重新发起登录。</p>");
          settle(() => reject(createAppError("AUTH_CANCELLED")));
          return;
        }

        if (!code || returnedState !== state) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<h2>授权失败</h2><p>请返回 PushGo 重新尝试。</p>");
          settle(() => reject(createAppError("AUTH_FAILED")));
          return;
        }

        const address = server.address() as AddressInfo;
        const redirectUri = `http://127.0.0.1:${address.port}${CALLBACK_PATH}`;

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<h2>授权成功</h2><p>请返回 PushGo 继续推送。</p>");

        settle(() => resolve({ code, redirectUri }));
      });

      server.on("error", () => {
        settle(() => reject(createAppError("AUTH_FAILED")));
      });

      server.listen(0, "127.0.0.1", async () => {
        try {
          const address = server.address() as AddressInfo;
          const redirectUri = `http://127.0.0.1:${address.port}${CALLBACK_PATH}`;
          const authUrl = this.buildAuthorizationUrl(platform, config, state, redirectUri);
          await shell.openExternal(authUrl);
        } catch {
          settle(() => reject(createAppError("AUTH_FAILED")));
        }
      });
    });
  }

  private buildAuthorizationUrl(
    platform: Platform,
    config: OAuthConfig & { clientId: string; clientSecret: string },
    state: string,
    redirectUri: string
  ): string {
    const url = new URL(config.authorizeUrl);
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);

    if (config.scope) {
      url.searchParams.set("scope", config.scope);
    }

    if (platform === "gitee") {
      url.searchParams.set("force_verify", "true");
    }

    return url.toString();
  }

  private async exchangeToken(
    config: OAuthConfig & { clientId: string; clientSecret: string },
    code: string,
    redirectUri: string
  ): Promise<string> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TOKEN_TIMEOUT_MS);

    try {
      const response = await fetch(config.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json"
        },
        body,
        signal: controller.signal
      });

      const data = (await response.json()) as {
        access_token?: string;
        error?: string;
      };

      if (data.error === "access_denied") {
        throw createAppError("AUTH_CANCELLED");
      }

      if (!response.ok || !data.access_token) {
        throw createAppError("AUTH_FAILED");
      }

      return data.access_token;
    } catch (error) {
      if ((error as { name?: string }).name === "AbortError") {
        throw createAppError("NETWORK_TIMEOUT");
      }

      if (error instanceof Error && error.name === "AppError") {
        throw error;
      }

      throw createAppError("AUTH_FAILED");
    } finally {
      clearTimeout(timeout);
    }
  }
}
