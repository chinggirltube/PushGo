export type Platform = "github" | "gitee" | "gitea";

export interface AppState {
  gitInstalled: boolean;
  platform: Platform | null;
  projectPath: string | null;
  repoUrl: string | null;
  auth: { github: boolean; gitee: boolean; gitea: boolean };
}

export interface GitService {
  checkInstalled(): Promise<boolean>;
  isRepo(projectPath: string): Promise<boolean>;
  initRepo(projectPath: string): Promise<void>;
  ensureUserConfig(projectPath: string): Promise<void>;
  addAll(projectPath: string): Promise<void>;
  commit(projectPath: string, message: string): Promise<"committed" | "no_changes">;
  setRemote(projectPath: string, repoUrl: string): Promise<void>;
  push(projectPath: string): Promise<void>;
}

export interface AuthService {
  isLoggedIn(platform: Platform, options?: { repoUrl?: string }): Promise<boolean>;
  login(platform: Platform, options?: { repoUrl?: string }): Promise<void>;
  logout(platform: Platform, options?: { repoUrl?: string }): Promise<void>;
}

export interface RepoService {
  validateRepoUrl(url: string, platform: Platform): { ok: boolean; code?: string; message?: string };
  detectPlatformFromUrl(url: string): Platform | null;
}

export interface PushOrchestrator {
  run(params: { platform: Platform; projectPath: string; repoUrl: string }): Promise<void>;
}

export type PushStage = "prepare" | "collect" | "commit" | "upload";

export interface PushProgressEvent {
  stage: PushStage;
  message: string;
}

export interface PushRunMeta {
  commitStatus: "committed" | "no_changes";
  fallbackToMaster: boolean;
}

export type ErrorCode =
  | "APP_GIT_NOT_FOUND"
  | "APP_GIT_HELPER_MISSING"
  | "APP_GIT_HELPER_UNSUPPORTED"
  | "APP_FOLDER_INVALID"
  | "URL_INVALID_FORMAT"
  | "URL_PLATFORM_MISMATCH"
  | "AUTH_CANCELLED"
  | "AUTH_FAILED"
  | "GIT_INIT_FAILED"
  | "GIT_COMMIT_NO_CHANGES"
  | "GIT_REMOTE_SET_FAILED"
  | "GIT_PUSH_AUTH_FAILED"
  | "GIT_PUSH_REJECTED"
  | "NETWORK_TIMEOUT"
  | "UNKNOWN";

export interface AppErrorPayload {
  code: ErrorCode | string;
  message: string;
  actionText?: string;
  actionType?: string;
}

export type IpcResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: AppErrorPayload;
    };

export interface PushRunParams {
  platform: Platform;
  projectPath: string;
  repoUrl: string;
}
