import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
export interface AdbStatus {
  available: boolean;
  version: string | null;
  path: string;
}
export interface SourceTestResult {
  success: boolean;
  reachable: boolean;
  message: string;
  downloadUrl?: string;
  durationMs: number;
}
export interface AppStats {
  activeJobs: number;
  completedJobs: number;
  failedJobs: number;
  totalDownloads: number;
  installedApps: number;
  sources: number;
  devicesOnline: number;
  devicesTotal: number;
}
export interface AppInfo {
  version: string;
  electron: string;
  node: string;
  adbPath: string;
  adbVersion: string | null;
  adapters: number;
  downloadDirectory: string;
  pluginDirectory: string;
}
export type BloatRisk = "safe" | "caution" | "expert";
export interface BloatMatch {
  packageName: string;
  id: string;
  label: string;
  vendor: string;
  risk: BloatRisk;
  description: string;
}
export interface BloatScanResult {
  matches: BloatMatch[];
  scanned: number;
  catalogSize: number;
}
export type RemovalMode = "full" | "user" | "disabled";
export interface ElectronAPI {
  window: {
    minimize(): void;
    maximize(): void;
    close(): void;
    isMaximized(): Promise<boolean>;
  };
  jobs: {
    create(url: string, deviceSerial?: string): Promise<string>;
    createDownload(url: string): Promise<string>;
    createFromFile(deviceSerial?: string): Promise<{
      cancelled: boolean;
      jobId?: string;
      filename?: string;
    }>;
    getAll(): Promise<unknown[]>;
    getById(id: string): Promise<unknown>;
    cancel(id: string): Promise<void>;
    retry(id: string): Promise<void>;
    pause(id: string): Promise<void>;
    resume(id: string): Promise<void>;
    remove(id: string): Promise<void>;
    getLogs(id: string): Promise<unknown[]>;
    clearFinished(): Promise<number>;
  };
  sources: {
    detect(url: string): Promise<unknown>;
    getAll(): Promise<unknown[]>;
    getById(id: string): Promise<unknown>;
    create(data: unknown): Promise<string>;
    update(id: string, data: unknown): Promise<void>;
    remove(id: string): Promise<void>;
    setEnabled(id: string, enabled: boolean): Promise<void>;
    test(id: string, testUrl?: string): Promise<SourceTestResult>;
    analyze(url: string): Promise<unknown>;
    importPlugin(): Promise<{
      cancelled: boolean;
      sourceId?: string;
    }>;
    exportPlugin(id: string): Promise<{
      cancelled: boolean;
      filePath?: string;
    }>;
    reload(): Promise<{
      loaded: number;
      failed: {
        plugin: string;
        error: string;
      }[];
    }>;
  };
  devices: {
    list(): Promise<unknown[]>;
    refresh(): Promise<unknown[]>;
    getInfo(serial: string): Promise<unknown>;
    setPreferred(serial: string): Promise<void>;
    getInstalledApps(
      serial: string,
      includeSystem?: boolean,
    ): Promise<unknown[]>;
    uninstall(
      serial: string,
      packageName: string,
    ): Promise<{
      success: boolean;
      mode?: "full" | "user" | "disabled";
      canDisable?: boolean;
      error?: string;
    }>;
    disableApp(
      serial: string,
      packageName: string,
    ): Promise<{
      success: boolean;
    }>;
    scanBloat(serial: string): Promise<BloatScanResult>;
    removeBloat(
      serial: string,
      packageName: string,
    ): Promise<{
      success: boolean;
      mode: RemovalMode;
    }>;
    connect(address: string): Promise<{
      success: boolean;
      message: string;
    }>;
    disconnect(address: string): Promise<void>;
    adbStatus(): Promise<AdbStatus>;
  };
  downloads: {
    getAll(): Promise<unknown[]>;
    getById(id: string): Promise<unknown>;
    remove(id: string, deleteFile?: boolean): Promise<void>;
    openFolder(id: string): Promise<void>;
    openFile(id: string): Promise<void>;
    install(id: string, deviceSerial?: string): Promise<string>;
    clearHistory(deleteFiles?: boolean): Promise<number>;
  };
  settings: {
    get(key: string): Promise<string | undefined>;
    set(key: string, value: unknown): Promise<void>;
    setMany(values: Record<string, unknown>): Promise<void>;
    getAll(): Promise<Record<string, string>>;
    pickDirectory(current?: string): Promise<string | null>;
    pickAdbPath(current?: string): Promise<string | null>;
  };
  app: {
    getStats(): Promise<AppStats>;
    getRecentJobs(limit?: number): Promise<unknown[]>;
    getLogs(limit?: number): Promise<unknown[]>;
    clearLogs(): Promise<void>;
    getInstalledApps(): Promise<unknown[]>;
    openExternal(url: string): Promise<void>;
    getInfo(): Promise<AppInfo>;
  };
  onEvent(callback: (event: string, data: unknown) => void): () => void;
}
const api: ElectronAPI = {
  window: {
    minimize: () => ipcRenderer.send("window:minimize"),
    maximize: () => ipcRenderer.send("window:maximize"),
    close: () => ipcRenderer.send("window:close"),
    isMaximized: () => ipcRenderer.invoke("window:isMaximized"),
  },
  jobs: {
    create: (url, deviceSerial) =>
      ipcRenderer.invoke("job:create", url, deviceSerial),
    createDownload: (url) => ipcRenderer.invoke("job:createDownload", url),
    createFromFile: (deviceSerial) =>
      ipcRenderer.invoke("job:createFromFile", deviceSerial),
    getAll: () => ipcRenderer.invoke("job:getAll"),
    getById: (id) => ipcRenderer.invoke("job:getById", id),
    cancel: (id) => ipcRenderer.invoke("job:cancel", id),
    retry: (id) => ipcRenderer.invoke("job:retry", id),
    pause: (id) => ipcRenderer.invoke("job:pause", id),
    resume: (id) => ipcRenderer.invoke("job:resume", id),
    remove: (id) => ipcRenderer.invoke("job:remove", id),
    getLogs: (id) => ipcRenderer.invoke("job:getLogs", id),
    clearFinished: () => ipcRenderer.invoke("job:clearFinished"),
  },
  sources: {
    detect: (url) => ipcRenderer.invoke("source:detect", url),
    getAll: () => ipcRenderer.invoke("source:getAll"),
    getById: (id) => ipcRenderer.invoke("source:getById", id),
    create: (data) => ipcRenderer.invoke("source:create", data),
    update: (id, data) => ipcRenderer.invoke("source:update", id, data),
    remove: (id) => ipcRenderer.invoke("source:remove", id),
    setEnabled: (id, enabled) =>
      ipcRenderer.invoke("source:setEnabled", id, enabled),
    test: (id, testUrl) => ipcRenderer.invoke("source:test", id, testUrl),
    analyze: (url) => ipcRenderer.invoke("source:analyze", url),
    importPlugin: () => ipcRenderer.invoke("source:import"),
    exportPlugin: (id) => ipcRenderer.invoke("source:export", id),
    reload: () => ipcRenderer.invoke("source:reload"),
  },
  devices: {
    list: () => ipcRenderer.invoke("device:list"),
    refresh: () => ipcRenderer.invoke("device:refresh"),
    getInfo: (serial) => ipcRenderer.invoke("device:getInfo", serial),
    setPreferred: (serial) => ipcRenderer.invoke("device:setPreferred", serial),
    getInstalledApps: (serial, includeSystem) =>
      ipcRenderer.invoke("device:getInstalledApps", serial, includeSystem),
    uninstall: (serial, packageName) =>
      ipcRenderer.invoke("device:uninstall", serial, packageName),
    disableApp: (serial, packageName) =>
      ipcRenderer.invoke("device:disableApp", serial, packageName),
    scanBloat: (serial) => ipcRenderer.invoke("device:scanBloat", serial),
    removeBloat: (serial, packageName) =>
      ipcRenderer.invoke("device:removeBloat", serial, packageName),
    connect: (address) => ipcRenderer.invoke("device:connect", address),
    disconnect: (address) => ipcRenderer.invoke("device:disconnect", address),
    adbStatus: () => ipcRenderer.invoke("device:adbStatus"),
  },
  downloads: {
    getAll: () => ipcRenderer.invoke("download:getAll"),
    getById: (id) => ipcRenderer.invoke("download:getById", id),
    remove: (id, deleteFile) =>
      ipcRenderer.invoke("download:remove", id, deleteFile),
    openFolder: (id) => ipcRenderer.invoke("download:openFolder", id),
    openFile: (id) => ipcRenderer.invoke("download:openFile", id),
    install: (id, deviceSerial) =>
      ipcRenderer.invoke("download:install", id, deviceSerial),
    clearHistory: (deleteFiles) =>
      ipcRenderer.invoke("download:clearHistory", deleteFiles),
  },
  settings: {
    get: (key) => ipcRenderer.invoke("settings:get", key),
    set: (key, value) => ipcRenderer.invoke("settings:set", key, value),
    setMany: (values) => ipcRenderer.invoke("settings:setMany", values),
    getAll: () => ipcRenderer.invoke("settings:getAll"),
    pickDirectory: (current) =>
      ipcRenderer.invoke("settings:pickDirectory", current),
    pickAdbPath: (current) =>
      ipcRenderer.invoke("settings:pickAdbPath", current),
  },
  app: {
    getStats: () => ipcRenderer.invoke("app:getStats"),
    getRecentJobs: (limit) => ipcRenderer.invoke("app:getRecentJobs", limit),
    getLogs: (limit) => ipcRenderer.invoke("app:getLogs", limit),
    clearLogs: () => ipcRenderer.invoke("app:clearLogs"),
    getInstalledApps: () => ipcRenderer.invoke("app:getInstalledApps"),
    openExternal: (url) => ipcRenderer.invoke("app:openExternal", url),
    getInfo: () => ipcRenderer.invoke("app:getInfo"),
  },
  onEvent(callback) {
    const handler = (
      _event: IpcRendererEvent,
      payload: {
        event: string;
        data: unknown;
      },
    ) => {
      callback(payload.event, payload.data);
    };
    ipcRenderer.on("event-bus:message", handler);
    return () => {
      ipcRenderer.removeListener("event-bus:message", handler);
    };
  },
};
contextBridge.exposeInMainWorld("electronAPI", api);
