import { Platform, RepoService } from "../../shared/contracts";
import { createAppError } from "../errors";

const DEFAULT_GITEA_BASE_URL = "https://gitea.com";

export class DefaultRepoService implements RepoService {
  detectPlatformFromUrl(url: string): Platform | null {
    try {
      const parsed = new URL(url.trim());
      const host = parsed.hostname.toLowerCase();
      const pathParts = parsed.pathname.split("/").filter(Boolean);

      if (host === "github.com" || host.endsWith(".github.com")) {
        return "github";
      }

      if (host === "gitee.com" || host.endsWith(".gitee.com")) {
        return "gitee";
      }

      const giteaHost = this.getConfiguredGiteaHost();
      if (host === giteaHost || host.endsWith(`.${giteaHost}`) || host.includes("gitea")) {
        return "gitea";
      }

      // 对自建域名仓库，默认按 Gitea 识别，保证可继续流程。
      if (pathParts.length >= 2) {
        return "gitea";
      }

      return null;
    } catch {
      return null;
    }
  }

  validateRepoUrl(url: string, platform: Platform): { ok: boolean; code?: string; message?: string } {
    const raw = url.trim();

    if (!raw) {
      const error = createAppError("URL_INVALID_FORMAT");
      return { ok: false, code: error.payload.code, message: error.payload.message };
    }

    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      const error = createAppError("URL_INVALID_FORMAT");
      return { ok: false, code: error.payload.code, message: error.payload.message };
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      const error = createAppError("URL_INVALID_FORMAT");
      return { ok: false, code: error.payload.code, message: error.payload.message };
    }

    const pathParts = parsed.pathname.split("/").filter(Boolean);
    if (pathParts.length < 2) {
      const error = createAppError("URL_INVALID_FORMAT");
      return { ok: false, code: error.payload.code, message: error.payload.message };
    }

    const detectedPlatform = this.detectPlatformFromUrl(raw);

    if (detectedPlatform && detectedPlatform !== platform) {
      const error = createAppError("URL_PLATFORM_MISMATCH");
      return { ok: false, code: error.payload.code, message: error.payload.message };
    }

    if (!detectedPlatform && platform !== "gitea") {
      const error = createAppError("URL_INVALID_FORMAT");
      return { ok: false, code: error.payload.code, message: error.payload.message };
    }

    return { ok: true };
  }

  private getConfiguredGiteaHost(): string {
    const rawBase = (process.env.PUSHGO_GITEA_BASE_URL ?? DEFAULT_GITEA_BASE_URL).trim();

    try {
      const normalized = rawBase.startsWith("http") ? rawBase : `https://${rawBase}`;
      return new URL(normalized).hostname.toLowerCase();
    } catch {
      return "gitea.com";
    }
  }
}
