export type JobStatus =
  "queued" | "running" | "paused" | "completed" | "failed" | "cancelled";
export type DeviceStatus = "online" | "offline" | "unauthorized";
export type SourceStatus = "healthy" | "degraded" | "broken" | "disabled";
export interface Device {
  serial: string;
  status: DeviceStatus;
  model: string;
  manufacturer: string;
  androidVersion: string;
  architecture: string;
  sdkVersion?: string;
  batteryLevel?: number;
  storageFree?: string;
  isEmulator?: boolean;
  isPreferred: boolean;
}
export interface Source {
  id: string;
  domain: string;
  name: string;
  url: string;
  status: SourceStatus;
  isBuiltIn: boolean;
  pluginPath: string | null;
  successRate: number;
  totalAttempts: number;
  failureCount: number;
  lastTested: number | null;
  activeAdapterVersion: number;
  hasAdapter: boolean;
  supportedFormats: string[];
}
export interface AdapterRules {
  version: number;
  parserType: "html" | "json" | "regex";
  rules: {
    downloadPageSelector?: string;
    downloadLinkSelector?: string;
    appNameSelector?: string;
    versionSelector?: string;
    sizeSelector?: string;
    packageNameSelector?: string;
    fallbackSelectors?: string[];
    downloadButtonText?: string[];
  };
  downloadStrategy: "direct" | "html" | "browser" | "redirect";
  metadata?: Record<string, unknown>;
  headers?: Record<string, string>;
}
export interface SourceDetail extends Source {
  rules: AdapterRules | null;
  manifest: {
    name: string;
    description: string;
    supportedFormats: string[];
  } | null;
  activeVersion: number | null;
}
export interface Job {
  id: string;
  type: "install" | "download" | "analyze";
  url: string;
  status: JobStatus;
  progress: number;
  currentStep: string | null;
  totalSteps: number;
  sourceId: string | null;
  deviceId: string | null;
  error: string | null;
  result: string | null;
  createdAt: number;
  updatedAt: number;
}
export interface Download {
  id: string;
  jobId: string | null;
  sourceId: string | null;
  url: string;
  filename: string;
  filePath: string | null;
  fileSize: number | null;
  sha256: string | null;
  packageType: string | null;
  packageName: string | null;
  versionName: string | null;
  status: "downloading" | "completed" | "failed" | "deleted";
  createdAt: number;
}
export interface LogEntry {
  id: number;
  level: "debug" | "info" | "warn" | "error";
  source: string;
  message: string;
  metadata?: string | null;
  jobId?: string | null;
  createdAt: number;
}
export interface InstalledPackage {
  packageName: string;
  isSystem: boolean;
  versionName: string | null;
  installedByApp: boolean;
  installedAt: number | null;
}
export interface AnalysisResult {
  domain: string;
  title: string;
  confidence: number;
  detectedLinks: {
    url: string;
    text: string;
    selector: string;
    confidence: number;
  }[];
  detectedButtons: {
    text: string;
    selector: string;
    confidence: number;
  }[];
  suggestedRules: {
    downloadLinkSelector?: string;
    downloadPageSelector?: string;
    appNameSelector?: string;
    versionSelector?: string;
    fallbackSelectors: string[];
  };
  metadata: {
    appName?: string;
    title?: string;
    description?: string;
  };
}
export const STEP_LABELS: Record<string, string> = {
  detect_source: "Detecting source",
  resolve_download: "Resolving download link",
  download_file: "Downloading",
  validate_package: "Validating package",
  extract_package: "Extracting",
  install_apk: "Installing to device",
  verify_installation: "Verifying install",
};
