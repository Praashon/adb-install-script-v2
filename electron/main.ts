import { app, BrowserWindow, dialog } from "electron";
import { join } from "path";
import { type Server } from "net";
import { randomBytes } from "crypto";
import { mkdirSync, writeFileSync, unlinkSync } from "fs";
import { createExtensionBridge } from "./extensionBridge";
import { isTrustedRendererUrl } from "./rendererTrust";
import { is } from "@electron-toolkit/utils";
import { initializeDatabase, closeDatabase } from "@core/database/connection";
import { EventBus } from "@core/event-bus/eventBus";
import { createAppContext, AppContext } from "./appContext";
import { registerIpcHandlers } from "./ipc-handlers";
const EXTENSION_PORT = 12845;
let extensionTokenPath: string | null = null;
let extensionApprovalPending = false;
let mainWindow: BrowserWindow | null = null;
let context: AppContext | null = null;
let extensionServer: Server | null = null;
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#0a0e1a",
    webPreferences: {
      preload: join(__dirname, "../preload/preload.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.on("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  const notifyMaximizeState = (): void => {
    mainWindow?.webContents.send("event-bus:message", {
      event: "window:state",
      data: { maximized: mainWindow?.isMaximized() ?? false },
    });
  };
  mainWindow.on("maximize", notifyMaximizeState);
  mainWindow.on("unmaximize", notifyMaximizeState);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedRendererUrl(url, join(__dirname, "../renderer/index.html"),
      is.dev ? process.env.ELECTRON_RENDERER_URL : undefined)) event.preventDefault();
  });
  mainWindow.webContents.on("will-redirect", (event) => event.preventDefault());
  mainWindow.webContents.on("will-attach-webview", (event) => event.preventDefault());
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  mainWindow.webContents.session.setPermissionCheckHandler(() => false);
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}
async function bootstrap(): Promise<void> {
  const dbPath = join(app.getPath("userData"), "adb-installer.db");
  const database = initializeDatabase(dbPath);
  const eventBus = new EventBus();
  context = await createAppContext(database, eventBus);
  registerIpcHandlers(context);
  eventBus.onAny((event, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("event-bus:message", { event, data });
    }
  });
  context.deviceMonitor.start();
  context.wirelessReconnector.start();
  await context.jobRunner.recoverPendingJobs();
  startExtensionServer();
}
function startExtensionServer(): void {
  const token = randomBytes(32).toString("hex");
  const directory = join(app.getPath("appData"), "adb-apk-installer-pro");
  mkdirSync(directory, { recursive: true });
  extensionTokenPath = join(directory, "extension-token");
  writeFileSync(extensionTokenPath, token, { mode: 0o600 });
  extensionServer = createExtensionBridge({
    token,
    onRequest: async (url) => {
      if (!context || !mainWindow || mainWindow.isDestroyed()) return { error: "App is unavailable" };
      if (extensionApprovalPending) return { error: "Another extension request is awaiting approval" };
      extensionApprovalPending = true;
      try {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        const result = await dialog.showMessageBox(mainWindow, {
          type: "question", title: "Browser download request",
          message: "Download this package for review?",
          detail: `${url}\n\nThe file will be downloaded for review. Installation requires a separate action in the app.`,
          buttons: ["Cancel", "Download for review"], defaultId: 0, cancelId: 0, noLink: true,
        });
        if (result.response !== 1) return { cancelled: true };
        const jobId = await context.jobQueue.enqueueDownload(url);
        context.jobRunner.processNext();
        return { success: true, jobId, operation: "download" };
      } finally { extensionApprovalPending = false; }
    },
  });
  extensionServer.on("error", (error) => {
    context?.eventBus.log("extension", "error", `Extension bridge unavailable: ${error.message}`);
  });
  extensionServer.listen(EXTENSION_PORT, "127.0.0.1");
}
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(async () => {
    try {
      await bootstrap();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to start ADB APK Installer Pro:", message);
      dialog.showErrorBox("ADB APK Installer Pro could not start", message);
      app.quit();
      return;
    }
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
let shutdownComplete = false;
let shutdownStarted = false;
app.on("before-quit", (event) => {
  if (shutdownComplete) return;
  event.preventDefault();
  if (shutdownStarted) return;
  shutdownStarted = true;
  extensionServer?.close();
  if (extensionTokenPath) { try { unlinkSync(extensionTokenPath); } catch {} }
  void (context?.dispose() ?? Promise.resolve()).catch((error) => console.error("Shutdown failed:", error)).finally(() => {
    closeDatabase();
    shutdownComplete = true;
    app.quit();
  });
});
