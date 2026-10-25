import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Folder,
  Trash2,
  Search,
  PlayCircle,
  PauseCircle,
  RefreshCw,
  XCircle,
  RotateCcw,
  Smartphone,
  FileText,
  CheckCircle2,
  AlertCircle,
  Eraser,
  ShieldQuestion,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { downloadService, jobService } from "@/services";
import { useAppStore, notify } from "@/stores/appStore";
import { Modal, ConfirmDialog } from "@/components/Modal";
import { PipelineRail } from "@/components/PipelineRail";
import { cn, formatBytes, formatDate } from "@/lib/utils";
import { STEP_LABELS, type Download, type Job, type LogEntry } from "@/types";
import type { ApkAnalysis } from "../../electron/preload";
export function DownloadsPage() {
  const jobs = useAppStore((s) => s.jobs);
  const setJobs = useAppStore((s) => s.setJobs);
  const preferredDevice = useAppStore((s) => s.preferredDevice)();
  const [localAnalysis, setLocalAnalysis] = useState<ApkAnalysis | null>(null);
  const [analyzingFile, setAnalyzingFile] = useState(false);
  const closeAnalysis = useCallback(() => { setAnalyzeTarget(null); setLocalAnalysis(null); }, []);
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [logJob, setLogJob] = useState<Job | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Download | null>(null);
  const [analyzeTarget, setAnalyzeTarget] = useState<Download | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const loadDownloads = useCallback(async () => {
    try {
      setDownloads(await downloadService.getAll());
    } catch (error) {
      notify.error(
        "Could not load downloads",
        error instanceof Error ? error.message : undefined,
      );
    }
  }, []);
  useEffect(() => {
    void loadDownloads();
  }, [loadDownloads]);
  const finishedCount = jobs.filter((j) =>
    ["completed", "failed", "cancelled"].includes(j.status),
  ).length;
  useEffect(() => {
    void loadDownloads();
  }, [finishedCount, loadDownloads]);
  const activeJobs = jobs.filter((j) =>
    ["queued", "running", "paused"].includes(j.status),
  );
  const finishedJobs = jobs.filter((j) =>
    ["failed", "cancelled"].includes(j.status),
  );
  const filteredDownloads = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return downloads;
    return downloads.filter(
      (d) =>
        d.filename.toLowerCase().includes(needle) ||
        (d.packageName ?? "").toLowerCase().includes(needle),
    );
  }, [downloads, searchQuery]);
  const withRefresh = async (
    action: () => Promise<unknown>,
    failure: string,
  ): Promise<void> => {
    try {
      await action();
      setJobs(await jobService.getAll());
    } catch (error) {
      notify.error(failure, error instanceof Error ? error.message : undefined);
    }
  };
  const handlePauseResume = (job: Job): Promise<void> =>
    withRefresh(
      () =>
        job.status === "paused"
          ? jobService.resume(job.id)
          : jobService.pause(job.id),
      job.status === "paused" ? "Could not resume" : "Could not pause",
    );
  const handleCancel = (jobId: string): Promise<void> =>
    withRefresh(() => jobService.cancel(jobId), "Could not cancel");
  const handleRetry = (jobId: string): Promise<void> =>
    withRefresh(() => jobService.retry(jobId), "Could not retry");
  const handleRemoveJob = (jobId: string): Promise<void> =>
    withRefresh(() => jobService.remove(jobId), "Could not remove job");
  const reinstall = async (download: Download): Promise<void> => {
    try {
      await downloadService.install(download.id, preferredDevice?.serial);
      setJobs(await jobService.getAll());
      notify.success("Install queued", download.filename);
    } catch (error) {
      notify.error(
        "Could not install",
        error instanceof Error ? error.message : undefined,
      );
    }
  };
  const confirmDelete = async (): Promise<void> => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await downloadService.remove(pendingDelete.id, true);
      await loadDownloads();
      notify.success("Deleted", pendingDelete.filename);
      setPendingDelete(null);
    } catch (error) {
      notify.error(
        "Could not delete",
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setIsDeleting(false);
    }
  };
  const clearFinishedJobs = async (): Promise<void> => {
    try {
      const removed = await jobService.clearFinished();
      setJobs(await jobService.getAll());
      notify.success(
        removed > 0 ? `Cleared ${removed} finished job(s)` : "Nothing to clear",
      );
    } catch (error) {
      notify.error(
        "Could not clear jobs",
        error instanceof Error ? error.message : undefined,
      );
    }
  };
  return (
    <div className="max-w-5xl mx-auto py-6">
      <div className="flex flex-wrap gap-4 items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-ink mb-1">
            Downloads &amp; Jobs
          </h1>
          <p className="text-ink-2">
            Monitor active downloads and installation progress
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-secondary" disabled={analyzingFile} onClick={() => {
            setAnalyzingFile(true);
            void downloadService.analyzeFile().then(setLocalAnalysis)
              .catch((error: unknown) => notify.error("Analysis failed", error instanceof Error ? error.message : undefined))
              .finally(() => setAnalyzingFile(false));
          }}><ShieldQuestion className="w-4 h-4" />{analyzingFile ? "Analyzing..." : "Analyze local APK"}</button>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            type="text"
            className="input pl-9 w-64"
            placeholder="Search downloads…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            spellCheck={false}
            aria-label="Search downloads"
          />
        </div>
        </div>
      </div>

      <div className="space-y-8">
        <section>
          <h2 className="section-title flex items-center gap-2">
            Active Tasks
            <span className="badge-signal">{activeJobs.length}</span>
          </h2>

          <div className="space-y-4">
            {activeJobs.length === 0 ? (
              <div className="card text-center py-8 text-ink-3 border-dashed">
                No active tasks
              </div>
            ) : (
              activeJobs.map((job) => (
                <ActiveJobCard
                  key={job.id}
                  job={job}
                  onPauseResume={() => void handlePauseResume(job)}
                  onCancel={() => void handleCancel(job.id)}
                  onLogs={() => setLogJob(job)}
                />
              ))
            )}
          </div>
        </section>

        {finishedJobs.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title mb-0 flex items-center gap-2">
                Needs attention
                <span className="badge-fault">{finishedJobs.length}</span>
              </h2>
              <button
                className="btn-ghost text-xs py-1.5"
                onClick={() => void clearFinishedJobs()}
              >
                <Eraser className="w-3.5 h-3.5" />
                Clear finished
              </button>
            </div>

            <div className="space-y-3">
              {finishedJobs.map((job) => (
                <FailedJobCard
                  key={job.id}
                  job={job}
                  onRetry={() => void handleRetry(job.id)}
                  onRemove={() => void handleRemoveJob(job.id)}
                  onLogs={() => setLogJob(job)}
                />
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title mb-0">History</h2>
            {downloads.length > 0 && (
              <button
                className="btn-ghost text-xs py-1.5"
                onClick={() => setConfirmClear(true)}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear history
              </button>
            )}
          </div>

          <div className="card p-0 overflow-hidden border-line">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-ink-3 uppercase bg-inset border-b border-line">
                  <tr>
                    <th className="px-6 py-4 font-medium">File</th>
                    <th className="px-6 py-4 font-medium">Size</th>
                    <th className="px-6 py-4 font-medium">Date</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filteredDownloads.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-8 text-center text-ink-3"
                      >
                        {downloads.length === 0
                          ? "No downloaded files yet"
                          : "No files match that search"}
                      </td>
                    </tr>
                  ) : (
                    filteredDownloads.map((download) => (
                      <tr
                        key={download.id}
                        className="hover:bg-inset transition-colors"
                      >
                        <td className="px-6 py-4 font-medium text-ink-2 max-w-xs">
                          <div className="truncate" title={download.filename}>
                            {download.filename}
                          </div>
                          {download.packageName && (
                            <div className="text-xs text-ink-3 font-mono truncate mt-0.5">
                              {download.packageName}
                              {download.versionName
                                ? ` · v${download.versionName}`
                                : ""}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-ink-3 whitespace-nowrap">
                          {download.fileSize
                            ? formatBytes(download.fileSize)
                            : "-"}
                        </td>
                        <td className="px-6 py-4 text-ink-3 whitespace-nowrap">
                          {formatDate(download.createdAt)}
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={download.status} />
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <button
                            className="btn-icon"
                            onClick={() => setAnalyzeTarget(download)}
                            disabled={
                              download.status !== "completed" ||
                              !download.filePath
                            }
                            title="Analyze permissions"
                          >
                            <ShieldQuestion className="w-4 h-4" />
                          </button>
                          <button
                            className="btn-icon"
                            onClick={() => void reinstall(download)}
                            disabled={
                              download.status !== "completed" ||
                              !download.filePath
                            }
                            title="Install to device"
                          >
                            <Smartphone className="w-4 h-4" />
                          </button>
                          <button
                            className="btn-icon"
                            onClick={() =>
                              void downloadService
                                .openFolder(download.id)
                                .catch((error: unknown) =>
                                  notify.error(
                                    "Could not open folder",
                                    error instanceof Error
                                      ? error.message
                                      : undefined,
                                  ),
                                )
                            }
                            disabled={!download.filePath}
                            title="Show in folder"
                          >
                            <Folder className="w-4 h-4" />
                          </button>
                          <button
                            className="btn-icon hover:text-fault hover:bg-fault/10"
                            onClick={() => setPendingDelete(download)}
                            title="Delete file"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      <JobLogModal job={logJob} onClose={() => setLogJob(null)} />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete download?"
        message={`${pendingDelete?.filename} will be removed from the history and deleted from disk.`}
        confirmLabel="Delete"
        danger
        busy={isDeleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        open={confirmClear}
        title="Clear download history?"
        message="All history entries will be removed. The downloaded files stay on disk."
        confirmLabel="Clear history"
        danger
        onConfirm={() => {
          void downloadService
            .clearHistory(false)
            .then(() => loadDownloads())
            .then(() => notify.success("History cleared"))
            .catch((error: unknown) =>
              notify.error(
                "Could not clear history",
                error instanceof Error ? error.message : undefined,
              ),
            );
          setConfirmClear(false);
        }}
        onCancel={() => setConfirmClear(false)}
      />

      <AnalysisModal
        download={analyzeTarget}
        localAnalysis={localAnalysis}
        onClose={closeAnalysis}
      />
    </div>
  );
}
function StatusBadge({ status }: { status: Download["status"] }) {
  if (status === "completed")
    return <span className="badge-verify">Completed</span>;
  if (status === "failed") return <span className="badge-fault">Failed</span>;
  if (status === "downloading")
    return <span className="badge-signal">Downloading</span>;
  return <span className="badge-neutral">{status}</span>;
}
function ActiveJobCard({
  job,
  onPauseResume,
  onCancel,
  onLogs,
}: {
  job: Job;
  onPauseResume: () => void;
  onCancel: () => void;
  onLogs: () => void;
}) {
  const stepLabel = STEP_LABELS[job.currentStep ?? ""] ?? "Starting…";
  return (
    <div className="card relative overflow-hidden will-enter border-signal/20">
      <div className="flex justify-between items-start gap-4 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded bg-signal/10 flex items-center justify-center shrink-0">
            <RefreshCw
              className={cn(
                "w-5 h-5 text-signal",
                job.status === "running" && "animate-spin",
              )}
            />
          </div>
          <div className="min-w-0">
            <h3
              className="font-semibold text-ink truncate"
              title={job.url}
            >
              {job.url}
            </h3>
            <p className="text-xs text-ink-2">
              {job.status === "paused" ? "Paused" : stepLabel}
            </p>
          </div>
        </div>

        <div className="flex gap-1 shrink-0">
          <button className="btn-icon" onClick={onLogs} title="View log">
            <FileText className="w-5 h-5" />
          </button>
          <button
            className="btn-icon"
            onClick={onPauseResume}
            title={job.status === "paused" ? "Resume" : "Pause"}
          >
            {job.status === "paused" ? (
              <PlayCircle className="w-5 h-5" />
            ) : (
              <PauseCircle className="w-5 h-5" />
            )}
          </button>
          <button
            className="btn-icon hover:text-fault hover:bg-fault/10"
            onClick={onCancel}
            title="Cancel"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="mt-4">
        <PipelineRail
          type={job.type}
          currentStep={job.currentStep}
          progress={job.progress}
          status={job.status}
        />
      </div>
    </div>
  );
}
function FailedJobCard({
  job,
  onRetry,
  onRemove,
  onLogs,
}: {
  job: Job;
  onRetry: () => void;
  onRemove: () => void;
  onLogs: () => void;
}) {
  const cancelled = job.status === "cancelled";
  return (
    <div
      className={cn(
        "card py-4",
        cancelled ? "border-line" : "border-fault/20 bg-fault/[0.03]",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <AlertCircle
            className={cn(
              "w-5 h-5 mt-0.5 shrink-0",
              cancelled ? "text-ink-3" : "text-fault",
            )}
          />
          <div className="min-w-0">
            <p
              className="text-sm font-medium text-ink truncate"
              title={job.url}
            >
              {job.url}
            </p>
            <p className="text-xs text-ink-2 mt-1 break-words selectable">
              {cancelled ? "Cancelled" : job.error || "Failed"}
            </p>
          </div>
        </div>

        <div className="flex gap-1 shrink-0">
          <button className="btn-icon" onClick={onLogs} title="View log">
            <FileText className="w-4 h-4" />
          </button>
          <button className="btn-icon" onClick={onRetry} title="Retry">
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            className="btn-icon hover:text-fault hover:bg-fault/10"
            onClick={onRemove}
            title="Remove"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
const LOG_TONES: Record<string, string> = {
  error: "border-fault text-fault bg-fault/[0.05]",
  warn: "border-caution text-caution bg-caution/[0.05]",
  info: "border-signal/40 text-ink-2",
  debug: "border-white/10 text-ink-3",
};
function JobLogModal({
  job,
  onClose,
}: {
  job: Job | null;
  onClose: () => void;
}) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  useEffect(() => {
    if (!job) {
      setLogs([]);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    const load = (): void => {
      jobService
        .getLogs(job.id)
        .then((result) => {
          if (!cancelled) setLogs(result);
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    };
    load();
    const interval = ["queued", "running"].includes(job.status)
      ? setInterval(load, 1500)
      : null;
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [job]);
  return (
    <Modal
      open={Boolean(job)}
      title="Job log"
      description={job?.url}
      onClose={onClose}
      footer={
        <button className="btn-ghost" onClick={onClose}>
          Close
        </button>
      }
    >
      {job?.status === "completed" && (
        <div className="flex items-center gap-2 text-sm text-verify mb-4">
          <CheckCircle2 className="w-4 h-4" />
          Completed successfully
        </div>
      )}
      {job?.error && (
        <div className="rounded-lg border border-fault/30 bg-fault/[0.06] p-3 mb-4">
          <p className="text-sm text-fault break-words selectable">
            {job.error}
          </p>
        </div>
      )}

      {isLoading && logs.length === 0 ? (
        <p className="text-sm text-ink-3 py-8 text-center">Loading log…</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-ink-3 py-8 text-center">
          No log entries for this job
        </p>
      ) : (
        <div className="space-y-1">
          {logs.map((entry) => (
            <div
              key={entry.id}
              className={cn(
                "log-line",
                LOG_TONES[entry.level] ?? LOG_TONES.info,
              )}
            >
              <span className="text-ink-3 mr-2">
                {new Date(entry.createdAt).toLocaleTimeString()}
              </span>
              {entry.message}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

const PERMISSION_LABELS: Record<string, string> = {
  "android.permission.CAMERA": "Camera",
  "android.permission.RECORD_AUDIO": "Microphone",
  "android.permission.ACCESS_FINE_LOCATION": "Precise location",
  "android.permission.ACCESS_COARSE_LOCATION": "Approximate location",
  "android.permission.ACCESS_BACKGROUND_LOCATION": "Background location",
  "android.permission.READ_CONTACTS": "Read contacts",
  "android.permission.WRITE_CONTACTS": "Modify contacts",
  "android.permission.READ_SMS": "Read SMS",
  "android.permission.SEND_SMS": "Send SMS",
  "android.permission.RECEIVE_SMS": "Receive SMS",
  "android.permission.READ_CALL_LOG": "Read call log",
  "android.permission.READ_PHONE_STATE": "Phone state",
  "android.permission.CALL_PHONE": "Place calls",
  "android.permission.READ_EXTERNAL_STORAGE": "Read storage",
  "android.permission.WRITE_EXTERNAL_STORAGE": "Write storage",
  "android.permission.READ_MEDIA_IMAGES": "Read photos",
  "android.permission.READ_MEDIA_VIDEO": "Read videos",
  "android.permission.READ_MEDIA_AUDIO": "Read audio",
  "android.permission.MANAGE_EXTERNAL_STORAGE": "Manage all files",
  "android.permission.SYSTEM_ALERT_WINDOW": "Draw over other apps",
  "android.permission.REQUEST_INSTALL_PACKAGES": "Install other apps",
  "android.permission.BIND_ACCESSIBILITY_SERVICE": "Accessibility control",
  "android.permission.WRITE_SECURE_SETTINGS": "Write secure settings",
  "android.permission.BODY_SENSORS": "Body sensors",
  "android.permission.ACTIVITY_RECOGNITION": "Physical activity",
  "android.permission.INTERNET": "Internet access",
  "android.permission.POST_NOTIFICATIONS": "Post notifications",
};

function labelForPermission(permission: string): string {
  if (PERMISSION_LABELS[permission]) return PERMISSION_LABELS[permission];
  const tail = permission.split(".").pop() ?? permission;
  const words = tail.toLowerCase().split("_");
  return words
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function AnalysisModal({
  localAnalysis,
  download,
  onClose,
}: {
  download: Download | null;
  localAnalysis?: ApkAnalysis | null;
  onClose: () => void;
}) {
  const [analysis, setAnalysis] = useState<ApkAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!download) {
      setAnalysis(localAnalysis ?? null);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    downloadService
      .analyze(download.id)
      .then((result) => {
        if (!cancelled) setAnalysis(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          notify.error(
            "Could not analyze",
            error instanceof Error ? error.message : undefined,
          );
          onClose();
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [download, localAnalysis, onClose]);

  const dangerous = analysis?.permissions.filter((p) => p.dangerous) ?? [];
  const normal = analysis?.permissions.filter((p) => !p.dangerous) ?? [];

  return (
    <Modal
      open={Boolean(download || localAnalysis)}
      title="APK Security Center"
      description={download?.filename ?? localAnalysis?.fileName}
      onClose={onClose}
    >
      {isLoading ? (
        <p className="text-sm text-ink-3 py-8 text-center">
          Reading the manifest...
        </p>
      ) : !analysis ? null : (
        <div className="space-y-5">
          <dl className="space-y-3 text-sm">
            <div><dt className="text-ink-2">SHA-256</dt><dd className="font-mono break-all selectable mt-1">{analysis.sha256}</dd></div>
            <div><dt className="text-ink-2">Android compatibility</dt><dd>Min SDK {analysis.minSdk ?? "unknown"} / Target SDK {analysis.targetSdk ?? "unknown"}</dd></div>
            <div><dt className="text-ink-2">Native architectures</dt><dd>{analysis.architectures.join(", ") || "No native libraries detected in analyzed APK"}</dd></div>
            <div><dt className="text-ink-2">Signing verification: {analysis.signature.status}</dt><dd>{analysis.signature.detail}</dd>
              {analysis.signature.certificateSha256.map((digest) => <dd className="font-mono break-all selectable mt-2" key={digest}>{digest}</dd>)}</div>
          </dl>
          <ul className="text-sm text-ink-2 space-y-2" aria-label="Analysis limitations">
            {analysis.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="inset-panel px-3.5 py-3">
              <span className="text-sm text-ink-2 block mb-1">Package</span>
              <span className="text-sm font-mono text-ink break-all selectable">
                {analysis.packageName ?? "Unknown"}
              </span>
            </div>
            <div className="inset-panel px-3.5 py-3">
              <span className="text-sm text-ink-2 block mb-1">Version</span>
              <span className="text-sm text-ink">
                {analysis.versionName ?? "?"}
                {analysis.targetSdk ? ` · SDK ${analysis.targetSdk}` : ""}
              </span>
            </div>
          </div>

          <div
            className={cn(
              "panel p-3.5 flex items-center gap-3",
              dangerous.length > 0 || !analysis.metadataComplete
                ? "border-caution/30 bg-caution/[0.05]"
                : "border-verify/30 bg-verify/[0.05]",
            )}
          >
            {dangerous.length > 0 || !analysis.metadataComplete ? (
              <ShieldAlert className="w-5 h-5 text-caution shrink-0" />
            ) : (
              <ShieldCheck className="w-5 h-5 text-verify shrink-0" />
            )}
            <p className="text-sm text-ink-2">
              {dangerous.length > 0
                ? `${dangerous.length} sensitive permission${dangerous.length === 1 ? "" : "s"} out of ${analysis.permissions.length} requested.`
                : analysis.metadataComplete ? `No classified sensitive permissions among ${analysis.permissions.length} requested.` : "Permission information is unavailable or incomplete."}
            </p>
          </div>

          {dangerous.length > 0 && (
            <section>
              <h3 className="text-sm font-medium mb-2 text-caution">Sensitive</h3>
              <ul className="panel divide-y divide-line overflow-hidden">
                {dangerous.map((perm) => (
                  <li
                    key={perm.name}
                    className="flex items-center gap-3 px-4 py-2.5"
                  >
                    <ShieldAlert className="w-4 h-4 text-caution shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-ink">
                        {labelForPermission(perm.name)}
                      </p>
                      <p className="font-mono text-[11px] text-ink-3 truncate selectable">
                        {perm.name}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {normal.length > 0 && (
            <section>
              <h3 className="text-sm font-medium mb-2">Other permissions</h3>
              <ul className="panel divide-y divide-line overflow-hidden">
                {normal.map((perm) => (
                  <li
                    key={perm.name}
                    className="flex items-center gap-3 px-4 py-2"
                  >
                    <span className="text-sm text-ink-2">
                      {labelForPermission(perm.name)}
                    </span>
                    <span className="font-mono text-[11px] text-ink-3 ml-auto truncate selectable">
                      {perm.name}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {analysis.metadataComplete && analysis.permissions.length === 0 && (
            <p className="text-sm text-ink-3 py-6 text-center">
              This package requests no permissions.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
