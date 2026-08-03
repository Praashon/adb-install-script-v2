import { useCallback, useEffect, useMemo, useState } from "react";
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
  KeyRound,
  Camera,
  Video,
  Square,
  Radio,
  MonitorSmartphone,
  Search,
  AlertTriangle,
  ShieldAlert,
  BatteryMedium,
  HardDrive,
  Cpu,
} from "lucide-react";
import type { AppPermission, WirelessDevice } from "../../electron/preload";
import { deviceService, wirelessService } from "@/services";
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
  const [saved, setSaved] = useState<WirelessDevice[]>([]);
  const [wirelessBusy, setWirelessBusy] = useState<string | null>(null);
  const loadSaved = useCallback(async () => {
    try {
      setSaved(await wirelessService.list());
    } catch {
      void 0;
    }
  }, []);
  useEffect(() => {
    void loadSaved();
  }, [loadSaved]);
  const connectSaved = async (device: WirelessDevice): Promise<void> => {
    setWirelessBusy(device.id);
    try {
      await wirelessService.connect(device.id);
      notify.success("Connected", device.label);
      await refresh();
      await loadSaved();
    } catch (error) {
      notify.error(
        "Could not connect",
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setWirelessBusy(null);
    }
  };
  const toggleAuto = async (device: WirelessDevice): Promise<void> => {
    try {
      await wirelessService.setAutoConnect(device.id, !device.autoConnect);
      await loadSaved();
    } catch (error) {
      notify.error(
        "Could not update",
        error instanceof Error ? error.message : undefined,
      );
    }
  };
  const forget = async (device: WirelessDevice): Promise<void> => {
    try {
      await wirelessService.remove(device.id);
      await loadSaved();
      notify.info("Removed", device.label);
    } catch (error) {
      notify.error(
        "Could not remove",
        error instanceof Error ? error.message : undefined,
      );
    }
  };
  const reconnectAll = async (): Promise<void> => {
    try {
      await wirelessService.reconnectAll();
      await refresh();
      await loadSaved();
    } catch (error) {
      notify.error(
        "Reconnect failed",
        error instanceof Error ? error.message : undefined,
      );
    }
  };
  const [mirroring, setMirroring] = useState<Set<string>>(new Set());
  useEffect(() => {
    let active = true;
    const online = useAppStore
      .getState()
      .devices.filter((d) => d.status === "online");
    (async () => {
      for (const d of online) {
        try {
          const status = await deviceService.mirrorStatus(d.serial);
          if (active && status.running) {
            setMirroring((prev) => new Set(prev).add(d.serial));
          }
        } catch {
          void 0;
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  const toggleMirror = async (serial: string): Promise<void> => {
    const isOn = mirroring.has(serial);
    try {
      if (isOn) {
        await deviceService.mirrorStop(serial);
        setMirroring((prev) => {
          const next = new Set(prev);
          next.delete(serial);
          return next;
        });
      } else {
        await deviceService.mirrorStart(serial);
        setMirroring((prev) => new Set(prev).add(serial));
        notify.info("Mirroring", "A scrcpy window is opening.");
      }
    } catch (error) {
      notify.error(
        "Could not mirror",
        error instanceof Error ? error.message : undefined,
      );
    }
  };
  const [reconnecting, setReconnecting] = useState<string | null>(null);
  const reconnectDevice = async (serial: string): Promise<void> => {
    setReconnecting(serial);
    try {
      await deviceService.reconnect(serial);
      const data = await deviceService.refresh();
      setDevices(data);
    } catch (error) {
      notify.error(
        "Could not reconnect",
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setReconnecting(null);
    }
  };
  const goWireless = async (serial: string): Promise<void> => {
    setWirelessBusy(serial);
    try {
      const result = await wirelessService.stabilize(serial);
      notify.success(
        result.connected ? "Now wireless" : "Prepared for wireless",
        result.connected
          ? `Connected on ${result.address} and saved for auto-reconnect.`
          : `Saved ${result.address}. It will reconnect when reachable.`,
      );
      await refresh();
      await loadSaved();
    } catch (error) {
      notify.error(
        "Could not switch to wireless",
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setWirelessBusy(null);
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

      {saved.length > 0 && (
        <section className="will-enter mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="eyebrow">Saved wireless devices</h2>
            <button
              className="btn-ghost text-xs py-1.5"
              onClick={() => void reconnectAll()}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reconnect all
            </button>
          </div>
          <ul className="panel divide-y divide-line overflow-hidden">
            {saved.map((entry) => {
              const online = devices.some(
                (d) => d.serial === entry.address && d.status === "online",
              );
              return (
                <li
                  key={entry.id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <span
                    className={cn(
                      "status-dot",
                      online ? "bg-verify" : "bg-ink-3",
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink truncate">{entry.label}</p>
                    <p className="font-mono text-[11px] text-ink-3 truncate selectable">
                      {entry.address}
                    </p>
                  </div>
                  <label
                    className="flex items-center gap-1.5 text-xs text-ink-2 cursor-pointer shrink-0"
                    title="Reconnect automatically when reachable"
                  >
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-signal"
                      checked={entry.autoConnect}
                      onChange={() => void toggleAuto(entry)}
                    />
                    Auto
                  </label>
                  <button
                    className="btn-secondary py-1.5 text-xs shrink-0"
                    disabled={online || wirelessBusy === entry.id}
                    onClick={() => void connectSaved(entry)}
                  >
                    <Wifi className="w-3.5 h-3.5" />
                    {online
                      ? "Connected"
                      : wirelessBusy === entry.id
                        ? "Connecting"
                        : "Connect"}
                  </button>
                  <button
                    className="btn-icon hover:text-fault shrink-0"
                    onClick={() => void forget(entry)}
                    title="Forget"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
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
            wirelessBusy={wirelessBusy === device.serial}
            mirroring={mirroring.has(device.serial)}
            reconnecting={reconnecting === device.serial}
            onSetPreferred={() => void setPreferred(device.serial)}
            onDetails={() => void openDetails(device)}
            onApps={() => setAppsDevice(device)}
            onScreenshot={() => void screenshot(device.serial)}
            onToggleRecord={() => void toggleRecord(device.serial)}
            onGoWireless={() => void goWireless(device.serial)}
            onToggleMirror={() => void toggleMirror(device.serial)}
            onReconnect={() => void reconnectDevice(device.serial)}
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
          void loadSaved();
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
  wirelessBusy,
  mirroring,
  reconnecting,
  onSetPreferred,
  onDetails,
  onApps,
  onScreenshot,
  onToggleRecord,
  onGoWireless,
  onToggleMirror,
  onReconnect,
}: {
  device: Device;
  index: number;
  capturing: boolean;
  recording: boolean;
  savingRecord: boolean;
  wirelessBusy: boolean;
  mirroring: boolean;
  reconnecting: boolean;
  onSetPreferred: () => void;
  onDetails: () => void;
  onApps: () => void;
  onScreenshot: () => void;
  onToggleRecord: () => void;
  onGoWireless: () => void;
  onToggleMirror: () => void;
  onReconnect: () => void;
}) {
  const isOnline = device.status === "online";
  const isUnauthorized = device.status === "unauthorized";
  const isWireless = /^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(device.serial);
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

      {!isOnline && !isUnauthorized && (
        <div className="mb-2">
          <p className="text-xs text-ink-3 mb-2">
            This device is offline. Reconnect kicks the ADB transport, which
            often clears a stale wireless or USB connection.
          </p>
          <button
            className="btn-secondary w-full py-2 text-xs"
            disabled={reconnecting}
            onClick={onReconnect}
          >
            <RefreshCw
              className={cn("w-4 h-4", reconnecting && "animate-spin")}
            />
            {reconnecting ? "Reconnecting" : "Reconnect"}
          </button>
        </div>
      )}

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

      {isOnline && (
        <div className="flex gap-2 mt-2">
          <button
            className={cn(
              "btn-secondary flex-1 py-2 text-xs",
              mirroring && "text-signal border-signal/40 bg-signal/[0.06]",
            )}
            onClick={onToggleMirror}
            title="Mirror and control the device screen with scrcpy"
          >
            <MonitorSmartphone className="w-4 h-4" />
            {mirroring ? "Stop mirror" : "Mirror"}
          </button>
          {!isWireless && (
            <button
              className="btn-secondary flex-1 py-2 text-xs"
              disabled={wirelessBusy}
              onClick={onGoWireless}
              title="Switch to a stable Wi-Fi connection on port 5555 and remember it"
            >
              <Radio
                className={cn("w-4 h-4", wirelessBusy && "animate-pulse")}
              />
              {wirelessBusy ? "Wireless" : "Go wireless"}
            </button>
          )}
        </div>
      )}
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
  const [permApp, setPermApp] = useState<string | null>(null);
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
                  onClick={() => setPermApp(pkg.packageName)}
                  title="Manage permissions"
                >
                  <KeyRound className="w-4 h-4" />
                </button>
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

      <PermissionsModal
        device={device}
        packageName={permApp}
        onClose={() => setPermApp(null)}
      />
    </>
  );
}

const PERMISSION_LABELS: Record<string, string> = {
  "android.permission.WRITE_SECURE_SETTINGS": "Write secure settings",
  "android.permission.WRITE_SETTINGS": "Modify system settings",
  "android.permission.DUMP": "Read system diagnostics",
  "android.permission.READ_LOGS": "Read system logs",
  "android.permission.PACKAGE_USAGE_STATS": "Usage access",
  "android.permission.BATTERY_STATS": "Battery statistics",
  "android.permission.CHANGE_CONFIGURATION": "Change configuration",
  "android.permission.GET_APP_OPS_STATS": "App-ops statistics",
  "android.permission.PROJECT_MEDIA": "Screen capture",
  "android.permission.CAMERA": "Camera",
  "android.permission.RECORD_AUDIO": "Microphone",
  "android.permission.ACCESS_FINE_LOCATION": "Precise location",
  "android.permission.ACCESS_COARSE_LOCATION": "Approximate location",
  "android.permission.ACCESS_BACKGROUND_LOCATION": "Background location",
  "android.permission.READ_CONTACTS": "Read contacts",
  "android.permission.WRITE_CONTACTS": "Modify contacts",
  "android.permission.READ_SMS": "Read SMS",
  "android.permission.SEND_SMS": "Send SMS",
  "android.permission.READ_CALL_LOG": "Read call log",
  "android.permission.READ_PHONE_STATE": "Phone state",
  "android.permission.READ_EXTERNAL_STORAGE": "Read storage",
  "android.permission.WRITE_EXTERNAL_STORAGE": "Write storage",
  "android.permission.READ_MEDIA_IMAGES": "Read photos",
  "android.permission.READ_MEDIA_VIDEO": "Read videos",
  "android.permission.READ_MEDIA_AUDIO": "Read audio",
  "android.permission.POST_NOTIFICATIONS": "Post notifications",
  "android.permission.BODY_SENSORS": "Body sensors",
  "android.permission.ACTIVITY_RECOGNITION": "Physical activity",
};

function labelForPermission(permission: string): string {
  if (PERMISSION_LABELS[permission]) return PERMISSION_LABELS[permission];
  const tail = permission.split(".").pop() ?? permission;
  return tail
    .toLowerCase()
    .split("_")
    .map((word, i) => (i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

function PermissionsModal({
  device,
  packageName,
  onClose,
}: {
  device: Device | null;
  packageName: string | null;
  onClose: () => void;
}) {
  const [permissions, setPermissions] = useState<AppPermission[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!device || !packageName) {
      setPermissions([]);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    deviceService
      .getPermissions(device.serial, packageName)
      .then((result) => {
        if (!cancelled) setPermissions(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          notify.error(
            "Could not read permissions",
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
  }, [device, packageName]);

  const toggle = async (perm: AppPermission): Promise<void> => {
    if (!device || !packageName) return;
    const next = !perm.granted;
    setBusy(perm.permission);
    try {
      await deviceService.setPermission(
        device.serial,
        packageName,
        perm.permission,
        next,
      );
      setPermissions((prev) =>
        prev.map((p) =>
          p.permission === perm.permission ? { ...p, granted: next } : p,
        ),
      );
    } catch (error) {
      notify.error(
        next ? "Could not grant" : "Could not revoke",
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setBusy(null);
    }
  };

  const special = permissions.filter((p) => p.special);
  const runtime = permissions.filter((p) => !p.special);

  return (
    <Modal
      open={Boolean(packageName)}
      title="Permissions"
      description={packageName ?? ""}
      onClose={onClose}
    >
      {isLoading ? (
        <p className="text-sm text-ink-3 py-8 text-center">
          Reading permissions from device…
        </p>
      ) : permissions.length === 0 ? (
        <p className="text-sm text-ink-3 py-8 text-center">
          No ADB-manageable permissions for this app.
        </p>
      ) : (
        <div className="space-y-5">
          {special.length > 0 && (
            <section>
              <h3 className="eyebrow mb-2 flex items-center gap-2">
                <ShieldAlert className="w-3.5 h-3.5 text-caution" />
                Special access
              </h3>
              <ul className="panel divide-y divide-line overflow-hidden">
                {special.map((perm) => (
                  <PermissionRow
                    key={perm.permission}
                    perm={perm}
                    busy={busy === perm.permission}
                    onToggle={() => void toggle(perm)}
                  />
                ))}
              </ul>
            </section>
          )}

          {runtime.length > 0 && (
            <section>
              <h3 className="eyebrow mb-2">Runtime permissions</h3>
              <ul className="panel divide-y divide-line overflow-hidden">
                {runtime.map((perm) => (
                  <PermissionRow
                    key={perm.permission}
                    perm={perm}
                    busy={busy === perm.permission}
                    onToggle={() => void toggle(perm)}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}

function PermissionRow({
  perm,
  busy,
  onToggle,
}: {
  perm: AppPermission;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ink">{labelForPermission(perm.permission)}</p>
        <p className="font-mono text-[11px] text-ink-3 truncate selectable">
          {perm.permission}
        </p>
      </div>
      <button
        role="switch"
        aria-checked={perm.granted}
        aria-label={`${perm.granted ? "Revoke" : "Grant"} ${perm.permission}`}
        disabled={busy}
        onClick={onToggle}
        className={cn(
          "relative w-9 h-5 rounded-full shrink-0 transition-colors disabled:opacity-50",
          perm.granted ? "bg-verify" : "bg-line-strong",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform",
            perm.granted && "translate-x-4",
          )}
        />
      </button>
    </li>
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
  const [mode, setMode] = useState<"pair" | "connect">("pair");
  const [pairAddress, setPairAddress] = useState("");
  const [pairCode, setPairCode] = useState("");
  const [address, setAddress] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const pair = async (): Promise<void> => {
    const value = pairAddress.trim();
    const code = pairCode.trim();
    if (!value || code.length < 6) return;
    setIsBusy(true);
    try {
      await deviceService.pair(value, code);
      notify.success("Paired", "Now enter the connection address below.");
      const host = value.split(":")[0];
      setAddress(host ? `${host}:` : "");
      setPairCode("");
      setMode("connect");
    } catch (error) {
      notify.error(
        "Pairing failed",
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setIsBusy(false);
    }
  };

  const connect = async (): Promise<void> => {
    const value = address.trim();
    if (!value) return;
    setIsBusy(true);
    try {
      await deviceService.connect(value);
      await wirelessService
        .save({ address: value, label: value, autoConnect: true })
        .catch(() => undefined);
      notify.success("Connected", "Saved for automatic reconnect next time.");
      const devices = await deviceService.list();
      onConnected(devices);
      setAddress("");
    } catch (error) {
      notify.error(
        "Connection failed",
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setIsBusy(false);
    }
  };

  const canSubmit =
    mode === "pair"
      ? pairAddress.trim().length > 0 && pairCode.trim().length >= 6
      : address.trim().length > 0;

  return (
    <Modal
      open={open}
      title="Wireless debugging"
      description="Pair a new device, then connect over the network"
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={() => void (mode === "pair" ? pair() : connect())}
            disabled={!canSubmit || isBusy}
          >
            {isBusy
              ? "Working"
              : mode === "pair"
                ? "Pair device"
                : "Connect"}
          </button>
        </>
      }
    >
      <div className="flex gap-1 p-1 rounded-lg bg-inset border border-line mb-5">
        <button
          className={cn(
            "flex-1 py-1.5 rounded-md text-sm font-medium transition-colors",
            mode === "pair"
              ? "bg-surface text-ink shadow-panel"
              : "text-ink-2 hover:text-ink",
          )}
          onClick={() => setMode("pair")}
        >
          Pair (Android 11+)
        </button>
        <button
          className={cn(
            "flex-1 py-1.5 rounded-md text-sm font-medium transition-colors",
            mode === "connect"
              ? "bg-surface text-ink shadow-panel"
              : "text-ink-2 hover:text-ink",
          )}
          onClick={() => setMode("connect")}
        >
          Connect
        </button>
      </div>

      {mode === "pair" ? (
        <div className="space-y-4">
          <div>
            <label className="label">Pairing address</label>
            <input
              className="input font-mono"
              placeholder="192.168.1.42:37105"
              value={pairAddress}
              onChange={(e) => setPairAddress(e.target.value)}
              spellCheck={false}
            />
          </div>
          <div>
            <label className="label">Pairing code</label>
            <input
              className="input font-mono tracking-[0.4em] text-center"
              placeholder="000000"
              inputMode="numeric"
              maxLength={6}
              value={pairCode}
              onChange={(e) =>
                setPairCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") void pair();
              }}
              spellCheck={false}
            />
          </div>
          <p className="text-xs text-ink-3 leading-relaxed">
            On the phone open Developer options, Wireless debugging, then Pair
            device with pairing code. Enter the address and 6-digit code it
            shows here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="label">Connection address</label>
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
          <p className="text-xs text-ink-3 leading-relaxed">
            Use the IP address and port shown on the main Wireless debugging
            screen. For USB devices you can run{" "}
            <code className="text-signal">adb tcpip 5555</code> instead.
          </p>
        </div>
      )}
    </Modal>
  );
}
