import path from "node:path";
import { app, BrowserWindow } from "electron";
import { registerIpcHandlers } from "./ipc";
import { SessionAuthService } from "./services/auth-service";
import { CliGitService } from "./services/git-service";
import { DefaultPushOrchestrator } from "./services/push-orchestrator";
import { DefaultRepoService } from "./services/repo-service";

let mainWindow: BrowserWindow | null = null;
let ipcRegistered = false;

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 980,
    minHeight: 680,
    show: false,
    backgroundColor: "#081321",
    title: "PushGo",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      partition: "temp:pushgo-session"
    }
  });

  void loadRenderer(mainWindow);

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function loadRenderer(target: BrowserWindow): Promise<void> {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  target.webContents.on("did-fail-load", async (_event, errorCode, errorDescription, validatedUrl) => {
    const html = `
      <html lang="zh-CN">
        <body style="font-family: sans-serif; padding: 24px;">
          <h2>PushGo 页面加载失败</h2>
          <p>错误码: ${errorCode}</p>
          <p>原因: ${errorDescription}</p>
          <p>地址: ${validatedUrl}</p>
        </body>
      </html>
    `;
    await target.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  });

  if (!app.isPackaged && devServerUrl) {
    await target.loadURL(devServerUrl);
    return;
  }

  const rendererEntry = path.join(app.getAppPath(), "dist", "index.html");
  await target.loadFile(rendererEntry);
}

function registerIpcIfNeeded(): void {
  if (ipcRegistered) {
    return;
  }

  const gitService = new CliGitService();
  const authService = new SessionAuthService();
  const repoService = new DefaultRepoService();
  const pushOrchestrator = new DefaultPushOrchestrator(gitService, authService);

  registerIpcHandlers({
    gitService,
    authService,
    repoService,
    pushOrchestrator
  });

  ipcRegistered = true;
}

app.whenReady().then(() => {
  registerIpcIfNeeded();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
