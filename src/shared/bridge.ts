import { IpcResult, Platform, PushProgressEvent, PushRunMeta, PushRunParams } from "./contracts";

export type CheckGitResult = {
  installed: boolean;
  warning?: {
    code: string;
    message: string;
    actionText?: string;
    actionType?: string;
  };
};

export type ValidateUrlResult = {
  ok: boolean;
  code?: string;
  message?: string;
  detectedPlatform: Platform | null;
};

export interface PushGoApi {
  checkGit(): Promise<IpcResult<CheckGitResult>>;
  selectFolder(): Promise<IpcResult<{ path: string | null }>>;
  validateRepoUrl(payload: { url: string; platform: Platform }): Promise<IpcResult<ValidateUrlResult>>;
  authStatus(payload: { platform: Platform; repoUrl?: string }): Promise<IpcResult<{ loggedIn: boolean }>>;
  authLogin(payload: { platform: Platform; repoUrl?: string }): Promise<IpcResult<{ loggedIn: boolean }>>;
  authLogout(payload: { platform: Platform; repoUrl?: string }): Promise<IpcResult<{ loggedIn: boolean }>>;
  runPush(payload: PushRunParams): Promise<IpcResult<{ meta: PushRunMeta }>>;
  openExternal(payload: { url: string }): Promise<IpcResult<{ opened: boolean }>>;
  onPushProgress(callback: (event: PushProgressEvent) => void): () => void;
}
