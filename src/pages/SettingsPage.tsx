import { useCallback, useEffect, useState } from "react";
import {
  Save,
  Terminal,
  Folder,
  CheckCircle2,
  XCircle,
  FolderOpen,
  Info,
  RefreshCw,
} from "lucide-react";
import { appService, deviceService, settingsService } from "@/services";
import { notify, useAppStore } from "@/stores/appStore";
import { cn } from "@/lib/utils";
import type { AdbStatus, AppInfo } from "../../electron/preload";
type Settings = Record<string, string>;
export function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({});
  const [saved, setSaved] = useState<Settings>({});
  const [isSaving, setIsSaving] = useState(false);
  const [adbStatus, setAdbStatus] = useState<AdbStatus | null>(null);
  const [isCheckingAdb, setIsCheckingAdb] = useState(false);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const setAdbAvailable = useAppStore((s) => s.setAdbStatus);
  const isDirty = JSON.stringify(settings) !== JSON.stringify(saved);
  const loadSettings = useCallback(async () => {
    try {
      const data = await settingsService.getAll();
      setSettings(data);
      setSaved(data);
    } catch (error) {
      notify.error(
        "Could not load settings",
        error instanceof Error ? error.message : undefined,
      );
    }
  }, []);
  const checkAdb = useCallback(async () => {
    setIsCheckingAdb(true);
    try {
      const status = await deviceService.adbStatus();
      setAdbStatus(status);
      setAdbAvailable(
        status.available,
        status.available ? null : "ADB executable not found",
      );
      return status;
    } catch {
      setAdbStatus(null);
      return null;
    } finally {
      setIsCheckingAdb(false);
    }
  }, [setAdbAvailable]);
  useEffect(() => {
    void loadSettings();
    void checkAdb();
    void appService
      .getInfo()
      .then(setAppInfo)
      .catch(() => undefined);
  }, [loadSettings, checkAdb]);
  const update = (key: string, value: string): void => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };
  const handleSave = async (): Promise<void> => {
    setIsSaving(true);
    try {
      const changed = Object.fromEntries(
        Object.entries(settings).filter(([key, value]) => saved[key] !== value),
      );
      if (Object.keys(changed).length === 0) {
        notify.info("Nothing to save");
        return;
      }
      await settingsService.setMany(changed);
      setSaved(settings);
      notify.success("Settings saved");
      if ("adb.path" in changed) {
        const status = await checkAdb();
        if (status && !status.available) {
          notify.warning("ADB still not found", `Tried: ${status.path}`);
        }
      }
      void appService
        .getInfo()
        .then(setAppInfo)
        .catch(() => undefined);
    } catch (error) {
      notify.error(
        "Could not save settings",
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setIsSaving(false);
    }
  };
  const browseAdb = async (): Promise<void> => {
    try {
      const path = await settingsService.pickAdbPath(settings["adb.path"]);
      if (path) update("adb.path", path);
    } catch (error) {
      notify.error(
        "Could not open picker",
        error instanceof Error ? error.message : undefined,
      );
    }
  };
  const browseDownloadDir = async (): Promise<void> => {
    try {
      const dir = await settingsService.pickDirectory(
        settings["download.directory"],
      );
      if (dir) update("download.directory", dir);
    } catch (error) {
      notify.error(
        "Could not open picker",
        error instanceof Error ? error.message : undefined,
      );
    }
  };
  return (
    <div className="max-w-4xl mx-auto py-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-ink mb-1">Settings</h1>
          <p className="text-ink-2">
            Configure ADB Installer Pro behavior and preferences
          </p>
        </div>
        <div className="flex items-center gap-4">
          {isDirty && (
            <span className="text-xs text-caution">Unsaved changes</span>
          )}
          <button
            className="btn-primary"
            onClick={() => void handleSave()}
            disabled={isSaving || !isDirty}
          >
            <Save className="w-4 h-4" />
            {isSaving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      <div className="space-y-6">
        <section className="card">
          <h2 className="text-lg font-semibold text-ink mb-4 flex items-center gap-2">
            <Terminal className="w-5 h-5 text-signal" />
            ADB Configuration
          </h2>

          <div className="space-y-4 max-w-2xl">
            <div>
              <label className="label">Custom ADB path</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="input flex-1 font-mono text-xs"
                  placeholder="Leave empty to auto-detect"
                  value={settings["adb.path"] ?? ""}
                  onChange={(e) => update("adb.path", e.target.value)}
                  spellCheck={false}
                />
                <button
                  className="btn-secondary shrink-0"
                  onClick={() => void browseAdb()}
                >
                  <FolderOpen className="w-4 h-4" />
                  Browse
                </button>
              </div>
              <p className="text-xs text-ink-3 mt-1">
                If empty, the app looks in PATH and the standard Android SDK
                locations.
              </p>
            </div>

            <div>
              <label className="label">Custom scrcpy path</label>
              <input
                type="text"
                className="input font-mono text-xs"
                placeholder="Leave empty to use the bundled or PATH scrcpy"
                value={settings["scrcpy.path"] ?? ""}
                onChange={(e) => update("scrcpy.path", e.target.value)}
                spellCheck={false}
              />
              <p className="text-xs text-ink-3 mt-1">
                Used for screen mirroring. If empty, the app uses a bundled
                scrcpy or one found on PATH.
              </p>
            </div>

            <div
              className={cn(
                "rounded-xl border p-4 flex items-start gap-3",
                adbStatus?.available
                  ? "border-verify/25 bg-verify/[0.05]"
                  : "border-fault/25 bg-fault/[0.05]",
              )}
            >
              {adbStatus?.available ? (
                <CheckCircle2 className="w-5 h-5 text-verify mt-0.5 shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 text-fault mt-0.5 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">
                  {adbStatus?.available ? "ADB detected" : "ADB not found"}
                </p>
                <p className="text-xs text-ink-2 mt-1 font-mono break-all selectable">
                  {adbStatus?.version ?? adbStatus?.path ?? "Checking…"}
                </p>
              </div>
              <button
                className="btn-secondary py-1.5 text-xs shrink-0"
                onClick={() => void checkAdb()}
                disabled={isCheckingAdb}
              >
                <RefreshCw
                  className={cn("w-3.5 h-3.5", isCheckingAdb && "animate-spin")}
                />
                Re-check
              </button>
            </div>
          </div>
        </section>

        <section className="card">
          <h2 className="text-lg font-semibold text-ink mb-4 flex items-center gap-2">
            <Folder className="w-5 h-5 text-signal" />
            Download Preferences
          </h2>

          <div className="space-y-6 max-w-2xl">
            <div>
              <label className="label">Download directory</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="input flex-1 font-mono text-xs"
                  placeholder={
                    settings["download.defaultDirectory"] ??
                    "Default downloads folder"
                  }
                  value={settings["download.directory"] ?? ""}
                  onChange={(e) => update("download.directory", e.target.value)}
                  spellCheck={false}
                />
                <button
                  className="btn-secondary shrink-0"
                  onClick={() => void browseDownloadDir()}
                >
                  <FolderOpen className="w-4 h-4" />
                  Browse
                </button>
              </div>
              {settings["download.defaultDirectory"] && (
                <p className="text-xs text-ink-3 mt-1 font-mono break-all">
                  Default: {settings["download.defaultDirectory"]}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Max concurrent jobs</label>
                <select
                  className="input"
                  value={settings["download.maxConcurrent"] ?? "2"}
                  onChange={(e) =>
                    update("download.maxConcurrent", e.target.value)
                  }
                >
                  {["1", "2", "3", "5"].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Max retries per step</label>
                <select
                  className="input"
                  value={settings["download.maxRetries"] ?? "3"}
                  onChange={(e) =>
                    update("download.maxRetries", e.target.value)
                  }
                >
                  <option value="0">0 (no retries)</option>
                  <option value="1">1</option>
                  <option value="3">3</option>
                  <option value="5">5</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <h2 className="text-lg font-semibold text-ink mb-4">
            Installation
          </h2>
          <div className="space-y-4 max-w-2xl">
            <Toggle
              checked={settings["install.allowDowngrade"] === "true"}
              onChange={(checked) =>
                update("install.allowDowngrade", String(checked))
              }
              title="Allow version downgrade"
              description="Pass -d to adb so an older version can replace a newer one."
            />
            <Toggle
              checked={settings["install.grantPermissions"] === "true"}
              onChange={(checked) =>
                update("install.grantPermissions", String(checked))
              }
              title="Grant all runtime permissions"
              description="Pass -g to adb so the app starts with every permission already granted."
            />
            <Toggle
              checked={settings["install.launchAfterInstall"] === "true"}
              onChange={(checked) =>
                update("install.launchAfterInstall", String(checked))
              }
              title="Launch app after install"
              description="Open the app on the device as soon as the install is verified."
            />
          </div>
        </section>

        <section className="card">
          <h2 className="text-lg font-semibold text-ink mb-4">
            Security &amp; Engines
          </h2>
          <div className="space-y-4 max-w-2xl">
            <Toggle
              checked={settings["browser.enabled"] !== "false"}
              onChange={(checked) => update("browser.enabled", String(checked))}
              title="Enable browser fallback engine"
              description="Renders JavaScript-driven pages with a headless browser when plain HTML parsing finds no link."
            />
            <Toggle
              checked={settings["browser.assisted"] === "true"}
              onChange={(checked) =>
                update("browser.assisted", String(checked))
              }
              title="Assisted browser mode"
              description="Open a visible browser window when a site asks for human verification, so you can complete the check yourself. Note that services like Cloudflare Turnstile detect the automation channel and may loop regardless. For those sites, download in your normal browser and use Install from file."
            />
            <Toggle
              checked={settings["adapter.autoUpdate"] !== "false"}
              onChange={(checked) =>
                update("adapter.autoUpdate", String(checked))
              }
              title="Auto-update built-in adapters"
              description="Reload bundled adapter rules on startup so layout changes are picked up."
            />
          </div>
        </section>

        {appInfo && (
          <section className="card">
            <h2 className="text-lg font-semibold text-ink mb-4 flex items-center gap-2">
              <Info className="w-5 h-5 text-signal" />
              About
            </h2>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm max-w-2xl">
              <InfoRow label="App version" value={appInfo.version} />
              <InfoRow label="Electron" value={appInfo.electron} />
              <InfoRow label="Node" value={appInfo.node} />
              <InfoRow
                label="Loaded adapters"
                value={String(appInfo.adapters)}
              />
              <InfoRow
                label="Download folder"
                value={appInfo.downloadDirectory}
                full
                mono
              />
              <InfoRow
                label="User plugins"
                value={appInfo.pluginDirectory}
                full
                mono
              />
            </dl>
          </section>
        )}
      </div>
    </div>
  );
}
function Toggle({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="relative flex items-center h-5">
        <input
          type="checkbox"
          className="w-4 h-4 rounded border-line bg-inset text-signal focus:ring-signal/30 "
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
      </div>
      <div className="text-sm">
        <span className="font-medium text-ink group-hover:text-white transition-colors block">
          {title}
        </span>
        <span className="text-ink-3 block mt-0.5">{description}</span>
      </div>
    </label>
  );
}
function InfoRow({
  label,
  value,
  full = false,
  mono = false,
}: {
  label: string;
  value: string;
  full?: boolean;
  mono?: boolean;
}) {
  return (
    <div className={full ? "col-span-2" : undefined}>
      <dt className="text-ink-3 text-xs uppercase tracking-wider mb-1">
        {label}
      </dt>
      <dd
        className={cn(
          "text-ink break-all",
          mono && "font-mono text-xs selectable",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
