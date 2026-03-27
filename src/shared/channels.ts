export const IPC_CHANNELS = {
  CHECK_GIT: "app:check-git",
  OPEN_EXTERNAL: "app:open-external",
  AUTH_LOGIN: "auth:login",
  AUTH_LOGOUT: "auth:logout",
  AUTH_STATUS: "auth:status",
  VALIDATE_URL: "repo:validate-url",
  SELECT_FOLDER: "git:select-folder",
  PUSH_RUN: "push:run"
} as const;

export const PUSH_PROGRESS_CHANNEL = "push:progress";
