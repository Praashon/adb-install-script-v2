import type {
  AdbStatus,
  AppStats,
  AppInfo,
  SourceTestResult,
} from "../../electron/preload";
import type {
  AnalysisResult,
  AdapterRules,
  Device,
  Download,
  InstalledPackage,
  Job,
  LogEntry,
  Source,
  SourceDetail,
} from "@/types";
const api = (): NonNullable<typeof window.electronAPI> => {
  if (!window.electronAPI) {
    throw new Error(
      "The app bridge is not available. The preload script failed to load, so restart the app.",
    );
  }
  return window.electronAPI;
};
export function toMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const match = raw.match(
    /Error invoking remote method '[^']+':\s*(?:Error:\s*)?([\s\S]*)$/,
  );
  const cleaned = (match ? match[1] : raw).trim();
  return cleaned.length > 0 ? cleaned : "Something went wrong";
}
async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw new Error(toMessage(error));
  }
}
export const jobService = {
  create: (url: string, deviceSerial?: string) =>
    call(() => api().jobs.create(url, deviceSerial)),
  createDownload: (url: string) => call(() => api().jobs.createDownload(url)),
  createFromFile: (deviceSerial?: string) =>
    call(() => api().jobs.createFromFile(deviceSerial)),
  getAll: () => call(() => api().jobs.getAll() as Promise<Job[]>),
  getById: (id: string) =>
    call(() => api().jobs.getById(id) as Promise<Job | undefined>),
  cancel: (id: string) => call(() => api().jobs.cancel(id)),
  retry: (id: string) => call(() => api().jobs.retry(id)),
  pause: (id: string) => call(() => api().jobs.pause(id)),
  resume: (id: string) => call(() => api().jobs.resume(id)),
  remove: (id: string) => call(() => api().jobs.remove(id)),
  getLogs: (id: string) =>
    call(() => api().jobs.getLogs(id) as Promise<LogEntry[]>),
  clearFinished: () => call(() => api().jobs.clearFinished()),
};
export const sourceService = {
  detect: (url: string) => call(() => api().sources.detect(url)),
  getAll: () => call(() => api().sources.getAll() as Promise<Source[]>),
  getById: (id: string) =>
    call(() => api().sources.getById(id) as Promise<SourceDetail>),
  create: (data: { name: string; domain: string; rules: AdapterRules }) =>
    call(() => api().sources.create(data)),
  update: (
    id: string,
    data: {
      name?: string;
      rules?: AdapterRules;
      status?: string;
    },
  ) => call(() => api().sources.update(id, data)),
  remove: (id: string) => call(() => api().sources.remove(id)),
  setEnabled: (id: string, enabled: boolean) =>
    call(() => api().sources.setEnabled(id, enabled)),
  test: (id: string, testUrl?: string): Promise<SourceTestResult> =>
    call(() => api().sources.test(id, testUrl)),
  analyze: (url: string) =>
    call(() => api().sources.analyze(url) as Promise<AnalysisResult>),
  importPlugin: () => call(() => api().sources.importPlugin()),
  exportPlugin: (id: string) => call(() => api().sources.exportPlugin(id)),
  reload: () => call(() => api().sources.reload()),
};
export const deviceService = {
  list: () => call(() => api().devices.list() as Promise<Device[]>),
  refresh: () => call(() => api().devices.refresh() as Promise<Device[]>),
  getInfo: (serial: string) =>
    call(() => api().devices.getInfo(serial) as Promise<Device>),
  setPreferred: (serial: string) =>
    call(() => api().devices.setPreferred(serial)),
  getInstalledApps: (serial: string, includeSystem?: boolean) =>
    call(
      () =>
        api().devices.getInstalledApps(serial, includeSystem) as Promise<
          InstalledPackage[]
        >,
    ),
  uninstall: (serial: string, packageName: string) =>
    call(() => api().devices.uninstall(serial, packageName)),
  disableApp: (serial: string, packageName: string) =>
    call(() => api().devices.disableApp(serial, packageName)),
  scanBloat: (serial: string) => call(() => api().devices.scanBloat(serial)),
  removeBloat: (serial: string, packageName: string) =>
    call(() => api().devices.removeBloat(serial, packageName)),
  extractApp: (serial: string, packageName: string) =>
    call(() => api().devices.extractApp(serial, packageName)),
  screenshot: (serial: string) => call(() => api().devices.screenshot(serial)),
  recordStart: (serial: string) => call(() => api().devices.recordStart(serial)),
  recordStop: (serial: string) => call(() => api().devices.recordStop(serial)),
  recordStatus: (serial: string) =>
    call(() => api().devices.recordStatus(serial)),
  pair: (address: string, code: string) =>
    call(() => api().devices.pair(address, code)),
  connect: (address: string) => call(() => api().devices.connect(address)),
  disconnect: (address: string) =>
    call(() => api().devices.disconnect(address)),
  adbStatus: (): Promise<AdbStatus> => call(() => api().devices.adbStatus()),
};
export const downloadService = {
  getAll: () => call(() => api().downloads.getAll() as Promise<Download[]>),
  getById: (id: string) =>
    call(() => api().downloads.getById(id) as Promise<Download>),
  remove: (id: string, deleteFile?: boolean) =>
    call(() => api().downloads.remove(id, deleteFile)),
  openFolder: (id: string) => call(() => api().downloads.openFolder(id)),
  openFile: (id: string) => call(() => api().downloads.openFile(id)),
  install: (id: string, deviceSerial?: string) =>
    call(() => api().downloads.install(id, deviceSerial)),
  clearHistory: (deleteFiles?: boolean) =>
    call(() => api().downloads.clearHistory(deleteFiles)),
};
export const settingsService = {
  get: (key: string) => call(() => api().settings.get(key)),
  set: (key: string, value: unknown) =>
    call(() => api().settings.set(key, value)),
  setMany: (values: Record<string, unknown>) =>
    call(() => api().settings.setMany(values)),
  getAll: () => call(() => api().settings.getAll()),
  pickDirectory: (current?: string) =>
    call(() => api().settings.pickDirectory(current)),
  pickAdbPath: (current?: string) =>
    call(() => api().settings.pickAdbPath(current)),
};
export const appService = {
  getStats: (): Promise<AppStats> => call(() => api().app.getStats()),
  getRecentJobs: (limit?: number) =>
    call(() => api().app.getRecentJobs(limit) as Promise<Job[]>),
  getLogs: (limit?: number) =>
    call(() => api().app.getLogs(limit) as Promise<LogEntry[]>),
  clearLogs: () => call(() => api().app.clearLogs()),
  getInstalledApps: () => call(() => api().app.getInstalledApps()),
  openExternal: (url: string) => call(() => api().app.openExternal(url)),
  getInfo: (): Promise<AppInfo> => call(() => api().app.getInfo()),
};
export const isBridgeAvailable = (): boolean => Boolean(window.electronAPI);

export const onAppEvent = (
  callback: (event: string, data: unknown) => void,
): (() => void) => {
  if (!window.electronAPI) return () => undefined;
  return window.electronAPI.onEvent(callback);
};
