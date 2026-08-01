import { app, BrowserWindow, shell } from "electron";
import { join } from "path";
import { createServer, Server, Socket } from "net";
import { is } from "@electron-toolkit/utils";
import { initializeDatabase, closeDatabase } from "@core/database/connection";
import { EventBus } from "@core/event-bus/eventBus";
import { createAppContext, AppContext } from "./appContext";
import { registerIpcHandlers } from "./ipc-handlers";
const EXTENSION_PORT = 12845;
const MAX_EXTENSION_MESSAGE_BYTES = 8192;
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
      sandbox: false,
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
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (/^https?:\/\//i.test(details.url)) {
      void shell.openExternal(details.url);
    }
    return { action: "deny" };
  });
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
  await context.jobRunner.recoverPendingJobs();
  startExtensionServer();
}
function startExtensionServer(): void {
  extensionServer = createServer((socket: Socket) => {
    let buffer = "";
    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf-8");
      if (buffer.length > MAX_EXTENSION_MESSAGE_BYTES) {
        socket.end(JSON.stringify({ error: "Message too large" }));
        return;
      }
      let message: {
        action?: string;
        url?: string;
      };
      try {
        message = JSON.parse(buffer);
      } catch {
        return;
      }
      buffer = "";
      void handleExtensionMessage(message, socket);
    });
    socket.on("error", () => socket.destroy());
  });
  extensionServer.on("error", (error) => {
    context?.eventBus.log(
      "extension",
      "error",
      `Extension bridge unavailable: ${error.message}`,
    );
  });
  extensionServer.listen(EXTENSION_PORT, "127.0.0.1", () => {
    context?.eventBus.log(
      "extension",
      "info",
      `Extension bridge listening on 127.0.0.1:${EXTENSION_PORT}`,
    );
  });
}
async function handleExtensionMessage(
  message: {
    action?: string;
    url?: string;
  },
  socket: Socket,
): Promise<void> {
  if (!context) {
    socket.end(JSON.stringify({ error: "App is still starting up" }));
    return;
  }
  if (message.action !== "install" || typeof message.url !== "string") {
    socket.end(JSON.stringify({ error: "Unknown action" }));
    return;
  }
  try {
    const jobId = await context.jobQueue.enqueue(message.url);
    context.jobRunner.processNext();
    socket.end(JSON.stringify({ success: true, jobId }));
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to queue job";
    socket.end(JSON.stringify({ error: errorMessage }));
  }
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
app.on("before-quit", () => {
  extensionServer?.close();
  context?.dispose();
  closeDatabase();
});
