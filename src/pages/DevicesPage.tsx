import { useEffect, useMemo, useState } from "react";
import {
  Smartphone,
  RefreshCw,
  Star,
  Info,
  Usb,
  Wifi,
  Package,
  Trash2,
  FileDown,
  Camera,
  Video,
  Square,
  Search,
  AlertTriangle,
  BatteryMedium,
  HardDrive,
  Cpu,
} from "lucide-react";
import { deviceService } from "@/services";
import { useAppStore, notify } from "@/stores/appStore";
import { Modal, ConfirmDialog } from "@/components/Modal";
import { cn, formatDate } from "@/lib/utils";
import type { Device, InstalledPackage } from "@/types";
export function DevicesPage() {
  const devices = useAppStore((s) => s.devices);
  const setDevices = useAppStore((s) => s.setDevices);
  const adbAvailable = useAppStore((s) => s.adbAvailable);
  const adbError = useAppStore((s) => s.adbError);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [detailDevice, setDetailDevice] = useState<Device | null>(null);
  const [appsDevice, setAppsDevice] = useState<Device | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [capturing, setCapturing] = useState<string | null>(null);
  const [recordingSerial, setRecordingSerial] = useState<string | null>(null);
  const [savingRecord, setSavingRecord] = useState(false);
  useEffect(() => {
    let active = true;
    const online = useAppStore
      .getState()
      .devices.filter((d) => d.status === "online");
    (async () => {
      for (const d of online) {
        try {
          const status = await deviceService.recordStatus(d.serial);
          if (active && status.recording) setRecordingSerial(d.serial);
        } catch {
          void 0;
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  const screenshot = async (serial: string): Promise<void> => {
    setCapturing(serial);
    try {
      await deviceService.screenshot(serial);
      notify.success("Screenshot saved", "Opened the captures folder.");
    } catch (error) {
      notify.error(
        "Screenshot failed",
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setCapturing(null);
    }
  };
  const toggleRecord = async (serial: string): Promise<void> => {
    if (recordingSerial && recordingSerial !== serial) {
      notify.warning("Already recording", "Stop the current recording first.");
      return;
    }
    if (recordingSerial === serial) {
      setSavingRecord(true);
      try {
        await deviceService.recordStop(serial);
        notify.success("Recording saved", "Opened the captures folder.");
      } catch (error) {
        notify.error(
          "Could not save recording",
          error instanceof Error ? error.message : undefined,
        );
      } finally {
        setRecordingSerial(null);
        setSavingRecord(false);
      }
      return;
    }
    try {
      await deviceService.recordStart(serial);
      setRecordingSerial(serial);
      notify.info("Recording started", "Up to 3 minutes. Press stop to save.");
    } catch (error) {
      notify.error(
        "Could not start recording",
        error instanceof Error ? error.message : undefined,
      );
    }
  };
  const refresh = async (): Promise<void> => {
    setIsRefreshing(true);
    try {
      const data = await deviceService.refresh();
      setDevices(data);
      if (data.length === 0)
        notify.info(
          "No devices found",
          "Check the USB cable and debugging prompt",
        );
    } catch (error) {
      notify.error(
        "Device scan failed",
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setIsRefreshing(false);
    }
  };
  const setPreferred = async (serial: string): Promise<void> => {
    try {
      await deviceService.setPreferred(serial);
      setDevices(
        devices.map((d) => ({ ...d, isPreferred: d.serial === serial })),
      );
      notify.success("Preferred device updated");
    } catch (error) {
      notify.error(
        "Could not set preferred device",
        error instanceof Error ? error.message : undefined,
      );
    }
  };
  const openDetails = async (device: Device): Promise<void> => {
    setDetailDevice(device);
    try {
      const info = await deviceService.getInfo(device.serial);
      setDetailDevice({ ...device, ...info });
    } catch (error) {
      notify.error(
        "Could not read device info",
        error instanceof Error ? error.message : undefined,
      );
    }
  };
  return (
    <div className="max-w-5xl mx-auto py-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-ink mb-1">
            Connected Devices
          </h1>
          <p className="text-ink-2">
            Detected automatically - installs go to the starred device
          </p>
        </div>
        <div className="flex gap-3">
          <button
            className="btn-secondary"
            onClick={() => setShowConnect(true)}
          >
            <Wifi className="w-4 h-4" />
            Connect over Wi-Fi
          </button>
          <button
            className="btn-secondary"
            onClick={() => void refresh()}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={cn("w-4 h-4", isRefreshing && "animate-spin")}
            />
            Refresh
          </button>
        </div>
      </div>

      {!adbAvailable && (
        <div className="card border-fault/30 bg-fault/[0.06] flex items-start gap-3 mb-6">
          <AlertTriangle className="w-5 h-5 text-fault mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-medium text-fault mb-1">
              ADB is not available
            </h3>
            <p className="text-sm text-ink-2">
              {adbError ??
                "Install Android platform-tools, or set a custom ADB path in Settings."}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {devices.map((device, i) => (
          <DeviceCard
            key={device.serial}
            device={device}
            index={i}
            capturing={capturing === device.serial}
            recording={recordingSerial === device.serial}
            savingRecord={savingRecord && recordingSerial === device.serial}
            onSetPreferred={() => void setPreferred(device.serial)}
            onDetails={() => void openDetails(device)}
            onApps={() => setAppsDevice(device)}
            onScreenshot={() => void screenshot(device.serial)}
            onToggleRecord={() => void toggleRecord(device.serial)}
          />
        ))}

        {devices.length === 0 && adbAvailable && (
          <div className="col-span-full py-16 text-center card border-dashed">
            <Usb className="w-16 h-16 text-ink-3 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-ink-2 mb-2">
              No Devices Connected
            </h3>
            <p className="text-ink-3 max-w-md mx-auto mb-6">
              Connect an Android device via USB and enable USB Debugging in
              Developer Options. New devices appear here within a few seconds.
            </p>
            <button
              className="btn-primary"
              onClick={() => void refresh()}
              disabled={isRefreshing}
            >
              <RefreshCw
                className={cn("w-4 h-4", isRefreshing && "animate-spin")}
              />
              Scan again
            </button>
          </div>
        )}
      </div>

      <DeviceDetailsModal
        device={detailDevice}
        onClose={() => setDetailDevice(null)}
      />
      <InstalledAppsModal
        device={appsDevice}
        onClose={() => setAppsDevice(null)}
      />
      <WifiConnectModal
        open={showConnect}
        onClose={() => setShowConnect(false)}
        onConnected={(data) => {
          setDevices(data);
          setShowConnect(false);
        }}
      />
    </div>
  );
}
function DeviceCard({
  device,
  index,
  capturing,
  recording,
  savingRecord,
  onSetPreferred,
  onDetails,
  onApps,
  onScreenshot,
  onToggleRecord,
}: {
  device: Device;
  index: number;
  capturing: boolean;
  recording: boolean;
  savingRecord: boolean;
  onSetPreferred: () => void;
  onDetails: () => void;
  onApps: () => void;
  onScreenshot: () => void;
  onToggleRecord: () => void;
}) {
  const isOnline = device.status === "online";
  const isUnauthorized = device.status === "unauthorized";
  return (
    <div
      className={cn(
        "card relative overflow-hidden transition-all duration-300 will-enter",
        device.isPreferred && isOnline && "border-signal/50 shadow-signal-glow",
      )}
      style={{ animationDelay: `${index * 0.08}s` }}
    >
      {device.isPreferred && isOnline && (
        <div className="absolute top-0 right-0 w-16 h-16 bg-signal/10 rounded-bl-full pointer-events-none" />
      )}

      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-4 min-w-0">
          <div
            className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
              isOnline
                ? "bg-verify/10 text-verify"
                : isUnauthorized
                  ? "bg-caution/10 text-caution"
                  : "bg-inset text-ink-2",
            )}
          >
            <Smartphone className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-lg text-ink truncate">
              {device.model || "Unknown Device"}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  isOnline
                    ? "bg-verify "
                    : isUnauthorized
                      ? "bg-caution"
                      : "bg-ink-3",
                )}
              />
              <span className="text-xs text-ink-2 font-mono truncate selectable">
                {device.serial}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={onSetPreferred}
          disabled={!isOnline}
          className={cn(
            "btn-icon rounded-full shrink-0",
            device.isPreferred && isOnline
              ? "text-signal bg-signal/10 hover:bg-signal/20"
              : "hover:text-signal",
            !isOnline && "opacity-40 cursor-not-allowed",
          )}
          title={device.isPreferred ? "Preferred device" : "Set as preferred"}
        >
          <Star
            className={cn(
              "w-5 h-5",
              device.isPreferred && isOnline && "fill-current",
            )}
          />
        </button>
      </div>

      {isUnauthorized && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-caution/[0.08] border border-caution/20 text-xs text-caution">
          Unauthorized - accept the USB debugging prompt on the device.
        </div>
      )}

      <div className="bg-inset rounded-lg p-4 grid grid-cols-2 gap-4 text-sm mb-4 border border-line">
        <Field label="Android" value={device.androidVersion || "Unknown"} />
        <Field
          label="Architecture"
          value={device.architecture || "Unknown"}
          mono
        />
        <Field
          label="Manufacturer"
          value={device.manufacturer || "Unknown"}
          className="col-span-2"
        />
      </div>

      <div className="flex gap-2">
        <button
          className="btn-secondary flex-1 py-2 text-xs"
          disabled={!isOnline}
          onClick={onDetails}
        >
          <Info className="w-4 h-4" />
          Details
        </button>
        <button
          className="btn-secondary flex-1 py-2 text-xs"
          disabled={!isOnline}
          onClick={onApps}
        >
          <Package className="w-4 h-4" />
          Installed Apps
        </button>
      </div>

      <div className="flex gap-2 mt-2">
        <button
          className="btn-secondary flex-1 py-2 text-xs"
          disabled={!isOnline || capturing}
          onClick={onScreenshot}
        >
          <Camera className={cn("w-4 h-4", capturing && "animate-pulse")} />
          {capturing ? "Capturing" : "Screenshot"}
        </button>
        <button
          className={cn(
            "btn-secondary flex-1 py-2 text-xs",
            recording && "text-fault border-fault/40 bg-fault/[0.06]",
          )}
          disabled={!isOnline || savingRecord}
          onClick={onToggleRecord}
        >
          {recording ? (
            <Square className="w-3.5 h-3.5 fill-current" />
          ) : (
            <Video className="w-4 h-4" />
          )}
          {recording ? "Stop" : savingRecord ? "Saving" : "Record"}
        </button>
      </div>
    </div>
  );
}
function Field({
  label,
  value,
  mono = false,
  className,
}: {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <span className="text-ink-3 block text-xs mb-1">{label}</span>
      <span
        className={cn(
          "text-ink font-medium",
          mono && "font-mono text-xs",
        )}
      >
        {value}
      </span>
    </div>
  );
}
function DeviceDetailsModal({
  device,
  onClose,
}: {
  device: Device | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={Boolean(device)}
      title={device?.model || "Device details"}
      description={device?.serial}
      onClose={onClose}
      size="sm"
    >
      {device && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <DetailStat
              icon={Cpu}
              label="Architecture"
              value={device.architecture || "Unknown"}
            />
            <DetailStat
              icon={Smartphone}
              label="Android"
              value={
                device.androidVersion
                  ? `${device.androidVersion}${device.sdkVersion ? ` (API ${device.sdkVersion})` : ""}`
                  : "Unknown"
              }
            />
            <DetailStat
              icon={BatteryMedium}
              label="Battery"
              value={
                device.batteryLevel !== undefined
                  ? `${device.batteryLevel}%`
                  : "Unknown"
              }
            />
            <DetailStat
              icon={HardDrive}
              label="Free storage"
              value={device.storageFree ?? "Unknown"}
            />
          </div>

          <div className="divider" />

          <dl className="space-y-3 text-sm">
            <Row
              label="Manufacturer"
              value={device.manufacturer || "Unknown"}
            />
            <Row label="Serial" value={device.serial} mono />
            <Row
              label="Connection"
              value={device.isEmulator ? "Emulator" : "USB / network"}
            />
            <Row label="Status" value={device.status} />
          </dl>
        </div>
      )}
    </Modal>
  );
}
function DetailStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
}) {
  return (
    <div className="inset-panel p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className="w-4 h-4 text-signal" />
        <span className="text-xs text-ink-3 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="text-sm font-medium text-ink truncate">{value}</div>
    </div>
  );
}
function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-3">{label}</dt>
      <dd
        className={cn(
          "text-ink text-right truncate",
          mono && "font-mono text-xs selectable",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
function InstalledAppsModal({
  device,
  onClose,
}: {
  device: Device | null;
  onClose: () => void;
}) {
  const [packages, setPackages] = useState<InstalledPackage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [includeSystem, setIncludeSystem] = useState(false);
  const [pendingUninstall, setPendingUninstall] = useState<string | null>(null);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [extracting, setExtracting] = useState<string | null>(null);
  const [blockedPackage, setBlockedPackage] = useState<{
    name: string;
    reason: string;
  } | null>(null);
  useEffect(() => {
    if (!device) {
      setPackages([]);
      setQuery("");
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    deviceService
      .getInstalledApps(device.serial, includeSystem)
      .then((result) => {
        if (!cancelled) setPackages(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          notify.error(
            "Could not list apps",
            error instanceof Error ? error.message : undefined,
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [device, includeSystem]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return packages;
    return packages.filter((pkg) =>
      pkg.packageName.toLowerCase().includes(needle),
    );
  }, [packages, query]);
  const extract = async (packageName: string): Promise<void> => {
    if (!device) return;
    setExtracting(packageName);
    try {
      const result = await deviceService.extractApp(device.serial, packageName);
      if (!result.cancelled) {
        notify.success(
          "APK extracted",
          `${result.files} file(s) saved to ${result.folder}`,
        );
      }
    } catch (error) {
      notify.error(
        "Extract failed",
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setExtracting(null);
    }
  };
  const uninstall = async (): Promise<void> => {
    if (!device || !pendingUninstall) return;
    setIsUninstalling(true);
    try {
      const result = await deviceService.uninstall(
        device.serial,
        pendingUninstall,
      );
      if (!result.success) {
        const name = pendingUninstall;
        setPendingUninstall(null);
        if (result.canDisable) {
          setBlockedPackage({
            name,
            reason: result.error ?? "The device refused to remove it.",
          });
        } else {
          notify.error("Uninstall failed", result.error);
        }
        return;
      }
      setPackages((prev) =>
        prev.filter((p) => p.packageName !== pendingUninstall),
      );
      notify.success(
        result.mode === "user" ? "Removed for this user" : "Uninstalled",
        result.mode === "user"
          ? `${pendingUninstall} is a system app, so it was removed for the current user. The APK stays on the system partition.`
          : pendingUninstall,
      );
      setPendingUninstall(null);
    } catch (error) {
      notify.error(
        "Uninstall failed",
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setIsUninstalling(false);
    }
  };
  const disableBlocked = async (): Promise<void> => {
    if (!device || !blockedPackage) return;
    setIsUninstalling(true);
    try {
      await deviceService.disableApp(device.serial, blockedPackage.name);
      setPackages((prev) =>
        prev.filter((p) => p.packageName !== blockedPackage.name),
      );
      notify.success(
        "App disabled",
        `${blockedPackage.name} is disabled for the current user. Re-enable it with: adb shell pm enable --user 0 ${blockedPackage.name}`,
      );
      setBlockedPackage(null);
    } catch (error) {
      notify.error(
        "Could not disable",
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setIsUninstalling(false);
    }
  };
  return (
    <>
      <Modal
        open={Boolean(device)}
        title="Installed apps"
        description={
          device
            ? `${device.model || device.serial} · ${packages.length} package(s)`
            : ""
        }
        onClose={onClose}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <input
              className="input pl-9 py-2"
              placeholder="Filter packages…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              spellCheck={false}
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-ink-2 cursor-pointer shrink-0">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-line bg-inset text-signal"
              checked={includeSystem}
              onChange={(e) => setIncludeSystem(e.target.checked)}
            />
            Include system
          </label>
        </div>

        {isLoading ? (
          <p className="text-sm text-ink-3 py-8 text-center">
            Reading packages from device…
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-ink-3 py-8 text-center">
            {packages.length === 0
              ? "No user apps installed"
              : "No packages match that filter"}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {filtered.map((pkg) => (
              <li
                key={pkg.packageName}
                className="flex items-center gap-3 py-2.5"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono text-ink truncate selectable">
                    {pkg.packageName}
                  </p>
                  {pkg.installedByApp && (
                    <p className="text-xs text-ink-3 mt-0.5">
                      Installed here
                      {pkg.versionName ? ` · v${pkg.versionName}` : ""}
                      {pkg.installedAt
                        ? ` · ${formatDate(pkg.installedAt)}`
                        : ""}
                    </p>
                  )}
                </div>
                <button
                  className="btn-icon shrink-0"
                  onClick={() => void extract(pkg.packageName)}
                  disabled={extracting === pkg.packageName}
                  title="Extract APK to PC"
                >
                  <FileDown
                    className={cn(
                      "w-4 h-4",
                      extracting === pkg.packageName && "animate-pulse",
                    )}
                  />
                </button>
                <button
                  className="btn-icon hover:text-fault hover:bg-fault/10 shrink-0"
                  onClick={() => setPendingUninstall(pkg.packageName)}
                  title="Uninstall"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingUninstall)}
        title="Uninstall app?"
        message={`${pendingUninstall} will be removed from the device along with its data. Preinstalled system apps cannot be deleted outright, so those are removed for the current user instead.`}
        confirmLabel="Uninstall"
        danger
        busy={isUninstalling}
        onConfirm={() => void uninstall()}
        onCancel={() => setPendingUninstall(null)}
      />

      <ConfirmDialog
        open={Boolean(blockedPackage)}
        title="Disable it instead?"
        message={`${blockedPackage?.reason} \n\nThe app can still be disabled: it stops running and leaves the launcher, but the APK stays on the system partition. This is reversible.`}
        confirmLabel="Disable app"
        danger
        busy={isUninstalling}
        onConfirm={() => void disableBlocked()}
        onCancel={() => setBlockedPackage(null)}
      />
    </>
  );
}
function WifiConnectModal({
  open,
  onClose,
  onConnected,
}: {
  open: boolean;
  onClose: () => void;
  onConnected: (devices: Device[]) => void;
}) {
  const [address, setAddress] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const connect = async (): Promise<void> => {
    const value = address.trim();
    if (!value) return;
    setIsConnecting(true);
    try {
      const result = await deviceService.connect(value);
      notify.success("Connected", result.message);
      const devices = await deviceService.list();
      onConnected(devices);
      setAddress("");
    } catch (error) {
      notify.error(
        "Connection failed",
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setIsConnecting(false);
    }
  };
  return (
    <Modal
      open={open}
      title="Connect over Wi-Fi"
      description="Pair a device already running ADB over TCP/IP"
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={() => void connect()}
            disabled={!address.trim() || isConnecting}
          >
            {isConnecting ? "Connecting…" : "Connect"}
          </button>
        </>
      }
    >
      <label className="label">Device address</label>
      <input
        className="input font-mono"
        placeholder="192.168.1.42:5555"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void connect();
        }}
        spellCheck={false}
      />
      <p className="text-xs text-ink-3 mt-3 leading-relaxed">
        On the device, enable Wireless debugging in Developer Options, or run{" "}
        <code className="text-signal">adb tcpip 5555</code> while it is plugged
        in over USB.
      </p>
    </Modal>
  );
}
