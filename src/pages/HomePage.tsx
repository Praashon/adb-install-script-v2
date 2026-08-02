import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Smartphone,
  TriangleAlert,
  X,
  DownloadCloud,
  FolderOpen,
  CircleCheck,
  CircleX,
} from "lucide-react";
import { appService, jobService } from "@/services";
import { useAppStore, notify } from "@/stores/appStore";
import { useCountUp } from "@/hooks/useEnterAnimation";
import { PipelineRail } from "@/components/PipelineRail";
import { STEP_LABELS, type Job } from "@/types";
import type { AppStats } from "../../electron/preload";
import { cn, formatDate } from "@/lib/utils";

export function HomePage() {
  const [url, setUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stats, setStats] = useState<AppStats | null>(null);
  const [recent, setRecent] = useState<Job[]>([]);
  const navigate = useNavigate();

  const devices = useAppStore((s) => s.devices);
  const jobs = useAppStore((s) => s.jobs);
  const adbAvailable = useAppStore((s) => s.adbAvailable);
  const preferredDevice = useAppStore((s) => s.preferredDevice)();

  const activeJobs = jobs.filter((j) =>
    ["queued", "running", "paused"].includes(j.status),
  );
  const unauthorized = devices.find((d) => d.status === "unauthorized");

  useEffect(() => {
    const load = (): void => {
      appService
        .getStats()
        .then(setStats)
        .catch(() => undefined);
      appService
        .getRecentJobs(6)
        .then(setRecent)
        .catch(() => undefined);
    };

    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [jobs.length]);

  const submit = async (mode: "install" | "download"): Promise<void> => {
    const trimmed = url.trim();
    if (!trimmed) return;

    if (!/^https?:\/\//i.test(trimmed)) {
      notify.error(
        "That is not a link",
        "Start the address with http:// or https://",
      );
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === "install") {
        await jobService.create(trimmed, preferredDevice?.serial);
        notify.success(
          "Install queued",
          preferredDevice
            ? `Target: ${preferredDevice.model || preferredDevice.serial}`
            : "The first available device will be used",
        );
      } else {
        await jobService.createDownload(trimmed);
        notify.success(
          "Download queued",
          "The APK will be saved without installing",
        );
      }

      setUrl("");
      navigate("/downloads");
    } catch (error) {
      notify.error(
        "Could not start the job",
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const installFromFile = async (): Promise<void> => {
    try {
      const result = await jobService.createFromFile(preferredDevice?.serial);
      if (result.cancelled) return;

      notify.success("Installing from file", result.filename);
      navigate("/downloads");
    } catch (error) {
      notify.error(
        "Could not install that file",
        error instanceof Error ? error.message : undefined,
      );
    }
  };

  const cancelJob = async (id: string): Promise<void> => {
    try {
      await jobService.cancel(id);
      notify.info("Job cancelled");
    } catch (error) {
      notify.error(
        "Could not cancel",
        error instanceof Error ? error.message : undefined,
      );
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <header className="will-enter mb-8">
        <p className="eyebrow mb-3">Sideload pipeline</p>
        <h1 className="font-display text-[2.125rem] leading-[1.1] font-semibold tracking-[-0.02em] text-ink">
          Put an APK on your phone.
        </h1>
        <p className="text-ink-2 mt-3 max-w-xl leading-relaxed">
          Paste a store link or a direct file. The bench resolves the download,
          checks the package, and installs it over ADB.
        </p>
      </header>

      <DeviceBanner
        adbAvailable={adbAvailable}
        deviceName={
          preferredDevice
            ? preferredDevice.model || preferredDevice.serial
            : null
        }
        unauthorizedSerial={unauthorized?.serial ?? null}
        onManage={() => navigate(adbAvailable ? "/devices" : "/settings")}
      />

      <section className="will-enter panel p-5 mb-6">
        <label htmlFor="apk-url" className="eyebrow block mb-2.5">
          Source
        </label>

        <div className="flex gap-2">
          <input
            id="apk-url"
            type="text"
            className="input-lg flex-1 font-mono text-sm"
            placeholder="https://apkmirror.com/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit("install");
            }}
            spellCheck={false}
            autoComplete="off"
          />
          <button
            className="btn-primary px-5 shrink-0"
            onClick={() => void submit("install")}
            disabled={!url.trim() || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-canvas/40 border-t-canvas rounded-full animate-spin" />
                Queueing
              </>
            ) : (
              <>
                Install
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

        <div className="flex items-center justify-between gap-4 mt-3">
          <p className="text-xs text-ink-3">
            APKMirror, APKPure, APKCombo, or a direct .apk, .xapk, or .apks
            link.
          </p>
          <div className="flex items-center gap-1 shrink-0">
            <button
              className="btn-ghost text-xs px-2.5 py-1.5"
              onClick={() => void submit("download")}
              disabled={!url.trim() || isSubmitting}
            >
              <DownloadCloud className="w-3.5 h-3.5" />
              Download only
            </button>
            <button
              className="btn-ghost text-xs px-2.5 py-1.5"
              onClick={() => void installFromFile()}
              title="Install a package already saved on this PC"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              Install from file
            </button>
          </div>
        </div>
      </section>

      {activeJobs.length > 0 && (
        <section className="will-enter mb-6">
          <h2 className="eyebrow mb-3">Running</h2>

          <div className="space-y-2.5">
            {activeJobs.slice(0, 3).map((job) => (
              <article key={job.id} className="panel p-4">
                <div className="flex items-start justify-between gap-4 mb-3.5">
                  <div className="min-w-0">
                    <p
                      className="font-mono text-xs text-ink truncate"
                      title={job.url}
                    >
                      {job.url}
                    </p>
                    <p className="text-xs text-ink-3 mt-1">
                      {job.status === "paused"
                        ? "Paused"
                        : (STEP_LABELS[job.currentStep ?? ""] ?? "Starting")}
                    </p>
                  </div>
                  <button
                    className="btn-icon hover:text-fault shrink-0"
                    onClick={() => void cancelJob(job.id)}
                    aria-label="Cancel job"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <PipelineRail
                  type={job.type}
                  currentStep={job.currentStep}
                  progress={job.progress}
                  status={job.status}
                />
              </article>
            ))}
          </div>
        </section>
      )}

      {stats && (
        <section className="will-enter grid grid-cols-4 gap-2.5 mb-6">
          <Tally label="Installed" value={stats.installedApps} />
          <Tally label="Downloads" value={stats.totalDownloads} />
          <Tally label="Sources" value={stats.sources} />
          <Tally
            label="Online"
            value={stats.devicesOnline}
            tone={stats.devicesOnline > 0}
          />
        </section>
      )}

      <section className="will-enter">
        <h2 className="eyebrow mb-3">Recent</h2>

        {recent.length === 0 ? (
          <div className="panel p-8 text-center">
            <p className="text-sm text-ink-2">No jobs yet.</p>
            <p className="text-xs text-ink-3 mt-1">
              Paste a link above to run your first install.
            </p>
          </div>
        ) : (
          <ul className="panel divide-y divide-line overflow-hidden">
            {recent.map((job) => (
              <li key={job.id} className="flex items-center gap-3 px-4 py-2.5">
                <JobGlyph status={job.status} />
                <span
                  className="font-mono text-xs text-ink-2 truncate flex-1"
                  title={job.url}
                >
                  {job.url}
                </span>
                <span className="font-mono text-eyebrow text-ink-3 shrink-0 tabular-nums">
                  {formatDate(job.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function JobGlyph({ status }: { status: Job["status"] }) {
  if (status === "completed")
    return <CircleCheck className="w-3.5 h-3.5 text-verify shrink-0" />;
  if (status === "failed")
    return <CircleX className="w-3.5 h-3.5 text-fault shrink-0" />;
  if (status === "cancelled")
    return <X className="w-3.5 h-3.5 text-ink-3 shrink-0" />;
  return <span className="status-dot bg-signal shrink-0 mx-1" />;
}

function Tally({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: boolean;
}) {
  const ref = useCountUp(value);

  return (
    <div className="inset-panel px-3.5 py-3">
      <span
        ref={ref}
        className={cn(
          "block font-display text-2xl font-semibold tabular-nums leading-none",
          tone ? "text-verify" : "text-ink",
        )}
      >
        {value}
      </span>
      <span className="eyebrow mt-1.5 block">{label}</span>
    </div>
  );
}

function DeviceBanner({
  adbAvailable,
  deviceName,
  unauthorizedSerial,
  onManage,
}: {
  adbAvailable: boolean;
  deviceName: string | null;
  unauthorizedSerial: string | null;
  onManage: () => void;
}) {
  // Nothing to report when a device is ready. Silence is the good state.
  if (adbAvailable && deviceName && !unauthorizedSerial) return null;

  const message = !adbAvailable
    ? "ADB was not found. Set the path in Settings, or install Android platform-tools."
    : unauthorizedSerial
      ? `Device ${unauthorizedSerial} is waiting for authorisation. Accept the USB debugging prompt on the phone.`
      : "No device connected. You can still download packages and install them later.";

  const action = !adbAvailable ? "Open settings" : "Manage devices";

  return (
    <div className="will-enter panel p-3.5 mb-6 flex items-center gap-3">
      <TriangleAlert
        className={cn(
          "w-4 h-4 shrink-0",
          adbAvailable ? "text-caution" : "text-fault",
        )}
      />
      <p className="text-sm text-ink-2 flex-1 leading-snug">{message}</p>
      <button
        className="btn-secondary text-xs px-2.5 py-1.5 shrink-0"
        onClick={onManage}
      >
        <Smartphone className="w-3.5 h-3.5" />
        {action}
      </button>
    </div>
  );
}
