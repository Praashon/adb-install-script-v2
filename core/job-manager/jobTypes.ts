export type JobType = "install" | "download" | "analyze";
export type JobStatus =
  "queued" | "running" | "paused" | "completed" | "failed" | "cancelled";
export type StepName =
  | "detect_source"
  | "resolve_download"
  | "download_file"
  | "validate_package"
  | "extract_package"
  | "install_apk"
  | "verify_installation";
export type StepStatus =
  "pending" | "running" | "completed" | "failed" | "skipped";
export interface JobStep {
  name: StepName;
  label: string;
  status: StepStatus;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  result?: Record<string, unknown>;
}
export interface JobDefinition {
  id: string;
  type: JobType;
  url: string;
  status: JobStatus;
  progress: number;
  steps: JobStep[];
  currentStepIndex: number;
  deviceId?: string;
  sourceId?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}
export interface JobContext {
  jobId: string;
  url: string;
  deviceId?: string;
  deviceSerial?: string;
  sourceId?: string;
  sourceName?: string;
  domain?: string;
  detectionType?: string;
  downloadId?: string;
  downloadUrl?: string;
  downloadPath?: string;
  downloadHeaders?: Record<string, string>;
  filename?: string;
  fileSize?: number;
  sha256?: string;
  strategy?: string;
  packageType?: string;
  packageName?: string;
  versionName?: string;
  versionCode?: number;
  architecture?: string;
  certificate?: string;
  apkFiles?: string[];
  obbFiles?: string[];
  installedAppId?: string;
}
export interface StepHelpers {
  setStepProgress(fraction: number): void;
  log(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    data?: Record<string, unknown>,
  ): void;
  signal: AbortSignal;
  throwIfAborted(): void;
}
export type StepExecutor = (
  context: JobContext,
  helpers: StepHelpers,
) => Promise<JobContext>;
export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableError";
  }
}
export const INSTALL_STEPS: Omit<JobStep, "status">[] = [
  { name: "detect_source", label: "Detect Source" },
  { name: "resolve_download", label: "Resolve Download" },
  { name: "download_file", label: "Download File" },
  { name: "validate_package", label: "Validate Package" },
  { name: "extract_package", label: "Extract Package" },
  { name: "install_apk", label: "Install APK" },
  { name: "verify_installation", label: "Verify Installation" },
];
export function createJobSteps(type: JobType): JobStep[] {
  if (type === "install") {
    return INSTALL_STEPS.map((s) => ({
      ...s,
      status: "pending" as StepStatus,
    }));
  }
  if (type === "download") {
    return INSTALL_STEPS.slice(0, 4).map((s) => ({
      ...s,
      status: "pending" as StepStatus,
    }));
  }
  return [
    {
      name: "detect_source" as StepName,
      label: "Analyze Website",
      status: "pending" as StepStatus,
    },
  ];
}
