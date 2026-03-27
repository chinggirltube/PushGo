import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import { IPC_CHANNELS, PUSH_PROGRESS_CHANNEL } from "../shared/channels";
import { PushGoApi } from "../shared/bridge";
import { PushProgressEvent } from "../shared/contracts";

const api: PushGoApi = {
  checkGit: () => ipcRenderer.invoke(IPC_CHANNELS.CHECK_GIT),
  selectFolder: () => ipcRenderer.invoke(IPC_CHANNELS.SELECT_FOLDER),
  validateRepoUrl: (payload) => ipcRenderer.invoke(IPC_CHANNELS.VALIDATE_URL, payload),
  authStatus: (payload) => ipcRenderer.invoke(IPC_CHANNELS.AUTH_STATUS, payload),
  authLogin: (payload) => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGIN, payload),
  authLogout: (payload) => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGOUT, payload),
  runPush: (payload) => ipcRenderer.invoke(IPC_CHANNELS.PUSH_RUN, payload),
  openExternal: (payload) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_EXTERNAL, payload),
  onPushProgress: (callback) => {
    const listener = (_event: IpcRendererEvent, payload: PushProgressEvent) => {
      callback(payload);
    };

    ipcRenderer.on(PUSH_PROGRESS_CHANNEL, listener);

    return () => {
      ipcRenderer.removeListener(PUSH_PROGRESS_CHANNEL, listener);
    };
  }
};

contextBridge.exposeInMainWorld("pushgo", api);
