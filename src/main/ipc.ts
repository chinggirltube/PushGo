import { dialog, ipcMain, IpcMainInvokeEvent, shell } from "electron";
import { IPC_CHANNELS, PUSH_PROGRESS_CHANNEL } from "../shared/channels";
import { AppErrorPayload, IpcResult, Platform, PushRunParams } from "../shared/contracts";
import { createAppError, toAppErrorPayload } from "./errors";
import { SessionAuthService } from "./services/auth-service";
import { CliGitService } from "./services/git-service";
import { DefaultPushOrchestrator } from "./services/push-orchestrator";
import { DefaultRepoService } from "./services/repo-service";

type Services = {
  gitService: CliGitService;
  authService: SessionAuthService;
  repoService: DefaultRepoService;
  pushOrchestrator: DefaultPushOrchestrator;
};

export function registerIpcHandlers(services: Services): void {
  ipcMain.handle(IPC_CHANNELS.CHECK_GIT, async () => {
    return wrap(async () => {
      const installed = await services.gitService.checkInstalled();
      if (!installed) {
        const notFound = createAppError("APP_GIT_NOT_FOUND");
        return {
          installed: false,
          warning: notFound.payload
        };
      }

      const helperWarning = await services.gitService.checkCredentialHelperReadiness();

      return {
        installed: true,
        warning: helperWarning ?? undefined
      };
    });
  });

  ipcMain.handle(IPC_CHANNELS.SELECT_FOLDER, async () => {
    return wrap(async () => {
      const result = await dialog.showOpenDialog({
        properties: ["openDirectory"]
      });

      return {
        path: result.canceled ? null : result.filePaths[0] ?? null
      };
    });
  });

  ipcMain.handle(IPC_CHANNELS.VALIDATE_URL, async (_event, payload: { url: string; platform: Platform }) => {
    return wrap(async () => {
      const validation = services.repoService.validateRepoUrl(payload.url, payload.platform);
      const detectedPlatform = services.repoService.detectPlatformFromUrl(payload.url);

      return {
        ...validation,
        detectedPlatform
      };
    });
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_STATUS, async (_event, payload: { platform: Platform; repoUrl?: string }) => {
    return wrap(async () => {
      const loggedIn = await services.authService.isLoggedIn(payload.platform, { repoUrl: payload.repoUrl });
      return { loggedIn };
    });
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN, async (_event, payload: { platform: Platform; repoUrl?: string }) => {
    return wrap(async () => {
      await services.authService.login(payload.platform, { repoUrl: payload.repoUrl });
      return { loggedIn: true };
    });
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async (_event, payload: { platform: Platform; repoUrl?: string }) => {
    return wrap(async () => {
      await services.authService.logout(payload.platform, { repoUrl: payload.repoUrl });
      return { loggedIn: false };
    });
  });

  ipcMain.handle(IPC_CHANNELS.PUSH_RUN, async (event: IpcMainInvokeEvent, payload: PushRunParams) => {
    return wrap(async () => {
      validatePushParams(payload);

      await services.pushOrchestrator.runWithProgress(payload, (progress) => {
        event.sender.send(PUSH_PROGRESS_CHANNEL, progress);
      });

      return {
        meta: services.pushOrchestrator.consumeLastMeta()
      };
    });
  });

  ipcMain.handle(IPC_CHANNELS.OPEN_EXTERNAL, async (_event, payload: { url: string }) => {
    return wrap(async () => {
      if (!payload?.url) {
        throw createAppError("UNKNOWN");
      }

      await shell.openExternal(payload.url);
      return { opened: true };
    });
  });
}

function validatePushParams(payload: PushRunParams): void {
  if (!payload.projectPath) {
    throw createAppError("APP_FOLDER_INVALID");
  }

  if (!payload.repoUrl) {
    throw createAppError("URL_INVALID_FORMAT");
  }
}

async function wrap<T>(run: () => Promise<T>): Promise<IpcResult<T>> {
  try {
    const data = await run();
    return { ok: true, data };
  } catch (error) {
    console.error("[PushGo][IPC] handler error:", error);
    const normalized: AppErrorPayload = toAppErrorPayload(error);
    return {
      ok: false,
      error: normalized
    };
  }
}
