import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  PackageX,
  ShieldCheck,
  TriangleAlert,
  ShieldAlert,
  Trash2,
  Smartphone,
  RefreshCw,
} from "lucide-react";
import { deviceService } from "@/services";
import { useAppStore, notify } from "@/stores/appStore";
import { ConfirmDialog } from "@/components/Modal";
import { cn } from "@/lib/utils";
import type {
  BloatMatch,
  BloatRisk,
  BloatScanResult,
} from "../../electron/preload";

const RISK_META: Record<
  BloatRisk,
  { label: string; badge: string; icon: typeof ShieldCheck; note: string }
> = {
  safe: {
    label: "Safe",
    badge: "badge-verify",
    icon: ShieldCheck,
    note: "Removing these has no effect on core features.",
  },
  caution: {
    label: "Caution",
    badge: "badge-caution",
    icon: TriangleAlert,
    note: "Some device features may depend on these.",
  },
  expert: {
    label: "Expert",
    badge: "badge-fault",
    icon: ShieldAlert,
    note: "Only remove these if you know what they do.",
  },
};

export function DebloatPage() {
  const navigate = useNavigate();
  const devices = useAppStore((s) => s.devices);
  const preferred = useAppStore((s) => s.preferredDevice)();

  const onlineDevices = devices.filter((d) => d.status === "online");
  const [serial, setSerial] = useState(
    preferred?.serial ?? onlineDevices[0]?.serial ?? "",
  );
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<BloatScanResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const activeSerial = serial || preferred?.serial || onlineDevices[0]?.serial;

  const grouped = useMemo(() => {
    const groups = new Map<string, BloatMatch[]>();
    for (const match of result?.matches ?? []) {
      const list = groups.get(match.vendor) ?? [];
      list.push(match);
      groups.set(match.vendor, list);
    }
    return [...groups.entries()];
  }, [result]);

  const scan = async (): Promise<void> => {
    if (!activeSerial) return;
    setIsScanning(true);
    setResult(null);
    setSelected(new Set());
    try {
      const scanResult = await deviceService.scanBloat(activeSerial);
      setResult(scanResult);
      setSelected(
        new Set(
          scanResult.matches
            .filter((m) => m.risk === "safe")
            .map((m) => m.packageName),
        ),
      );
      if (scanResult.matches.length === 0) {
        notify.info("Clean device", "No known bloatware was found.");
      }
    } catch (error) {
      notify.error(
        "Scan failed",
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setIsScanning(false);
    }
  };

  const toggle = (packageName: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(packageName)) next.delete(packageName);
      else next.add(packageName);
      return next;
    });
  };

  const selectByRisk = (risk: BloatRisk): void => {
    setSelected(
      new Set(
        (result?.matches ?? [])
          .filter((m) => m.risk === risk)
          .map((m) => m.packageName),
      ),
    );
  };

  const removeSelected = async (): Promise<void> => {
    if (!activeSerial || selected.size === 0) return;
    setConfirmOpen(false);

    const targets = (result?.matches ?? []).filter((m) =>
      selected.has(m.packageName),
    );
    let removed = 0;
    const failures: string[] = [];

    for (const match of targets) {
      setRemoving(match.packageName);
      try {
        await deviceService.removeBloat(activeSerial, match.packageName);
        removed += 1;
        setResult((prev) =>
          prev
            ? {
                ...prev,
                matches: prev.matches.filter(
                  (m) => m.packageName !== match.packageName,
                ),
              }
            : prev,
        );
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(match.packageName);
          return next;
        });
      } catch {
        failures.push(match.label);
      }
    }

    setRemoving(null);

    if (failures.length === 0) {
      notify.success(
        "Debloat complete",
        `Removed ${removed} app${removed === 1 ? "" : "s"} for Android user 0.`,
      );
    } else {
      notify.warning(
        `Removed ${removed}, ${failures.length} refused`,
        `The device blocked: ${failures.slice(0, 3).join(", ")}${failures.length > 3 ? "..." : ""}`,
      );
    }
  };

  const selectedList = (result?.matches ?? []).filter((m) =>
    selected.has(m.packageName),
  );
  const selectedHasRisk = selectedList.some((m) => m.risk !== "safe");

  if (onlineDevices.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-8 py-10">
        <PageHeader />
        <div className="panel p-8 text-center">
          <Smartphone className="w-10 h-10 text-ink-3 mx-auto mb-3" />
          <p className="text-sm text-ink-2">No device connected.</p>
          <p className="text-xs text-ink-3 mt-1 mb-5">
            Connect a phone over USB or Wi-Fi to scan for preinstalled apps.
          </p>
          <button
            className="btn-secondary text-xs"
            onClick={() => navigate("/devices")}
          >
            <Smartphone className="w-3.5 h-3.5" />
            Manage devices
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <PageHeader />

      <section className="will-enter panel p-4 mb-6 flex items-center gap-3 flex-wrap">
        {onlineDevices.length > 1 ? (
          <select
            className="input py-2 w-auto min-w-[16rem]"
            value={activeSerial}
            onChange={(e) => setSerial(e.target.value)}
          >
            {onlineDevices.map((d) => (
              <option key={d.serial} value={d.serial}>
                {d.model || d.serial} ({d.serial})
              </option>
            ))}
          </select>
        ) : (
          <div className="flex items-center gap-2 text-sm text-ink-2">
            <Smartphone className="w-4 h-4 text-signal" />
            {onlineDevices[0].model || onlineDevices[0].serial}
          </div>
        )}

        <button
          className="btn-primary ml-auto"
          onClick={() => void scan()}
          disabled={isScanning || !activeSerial}
        >
          <RefreshCw className={cn("w-4 h-4", isScanning && "animate-spin")} />
          {isScanning ? "Scanning" : result ? "Rescan" : "Scan device"}
        </button>
      </section>

      {result && result.matches.length > 0 && (
        <>
          <section className="will-enter flex items-center gap-2 mb-4 flex-wrap">
            <span className="eyebrow">
              {result.matches.length} removable across {grouped.length} brand
              {grouped.length === 1 ? "" : "s"}
            </span>
            <span className="text-ink-3 text-xs">
              scanned {result.scanned} packages
            </span>
            <div className="ml-auto flex items-center gap-1">
              <button
                className="btn-ghost text-xs px-2.5 py-1.5"
                onClick={() => selectByRisk("safe")}
              >
                Select safe
              </button>
              <button
                className="btn-ghost text-xs px-2.5 py-1.5"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </button>
            </div>
          </section>

          <div className="space-y-5">
            {grouped.map(([vendor, matches]) => (
              <section key={vendor} className="will-enter">
                <h2 className="eyebrow mb-2">{vendor}</h2>
                <ul className="panel divide-y divide-line overflow-hidden">
                  {matches.map((match) => (
                    <BloatRow
                      key={match.packageName}
                      match={match}
                      checked={selected.has(match.packageName)}
                      busy={removing === match.packageName}
                      onToggle={() => toggle(match.packageName)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <div className="sticky bottom-0 mt-6 -mx-8 px-8 py-4 bg-canvas/85 backdrop-blur border-t border-line flex items-center gap-3">
            <span className="text-sm text-ink-2">
              {selected.size} selected
            </span>
            <button
              className="btn-primary ml-auto"
              disabled={selected.size === 0 || removing !== null}
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="w-4 h-4" />
              {removing ? "Removing" : `Remove ${selected.size}`}
            </button>
          </div>
        </>
      )}

      {result && result.matches.length === 0 && (
        <div className="panel p-8 text-center will-enter">
          <ShieldCheck className="w-10 h-10 text-verify mx-auto mb-3" />
          <p className="text-sm text-ink-2">No known bloatware found.</p>
          <p className="text-xs text-ink-3 mt-1">
            Scanned {result.scanned} packages against {result.catalogSize}{" "}
            catalog entries.
          </p>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={`Remove ${selected.size} app${selected.size === 1 ? "" : "s"}?`}
        message={
          selectedHasRisk
            ? "Some selected apps are marked Caution or Expert. Removal targets Android user 0. App data or device features may be lost; restoration is not guaranteed."
            : "These packages will be removed for Android user 0. App data may be lost; restoration is not guaranteed."
        }
        confirmLabel="Remove"
        danger
        onConfirm={() => void removeSelected()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

function PageHeader() {
  return (
    <header className="will-enter mb-6">
      <p className="eyebrow mb-3 flex items-center gap-2">
        <PackageX className="w-3.5 h-3.5 text-signal" />
        Universal debloater
      </p>
      <h1 className="font-display text-[2rem] leading-[1.1] font-semibold tracking-[-0.02em] text-ink">
        Strip preinstalled bloat.
      </h1>
      <p className="text-ink-2 mt-3 max-w-xl leading-relaxed">
        Scan the device against a curated catalog of known manufacturer and
        carrier apps, then remove what you do not want. Everything is removed
        for Android user 0. Back up important data; restoration is not guaranteed.
      </p>
    </header>
  );
}

function BloatRow({
  match,
  checked,
  busy,
  onToggle,
}: {
  match: BloatMatch;
  checked: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  const risk = RISK_META[match.risk];
  const RiskIcon = risk.icon;

  return (
    <li
      className={cn(
        "flex items-start gap-3 px-4 py-3 transition-colors",
        checked && "bg-inset/50",
      )}
    >
      <input
        type="checkbox"
        className="mt-1 w-4 h-4 shrink-0 accent-signal"
        checked={checked}
        onChange={onToggle}
        disabled={busy}
        aria-label={`Select ${match.label}`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-ink">{match.label}</span>
          <span className={risk.badge}>
            <RiskIcon className="w-3 h-3" />
            {risk.label}
          </span>
          {busy && (
            <span className="font-mono text-eyebrow text-signal">
              removing
            </span>
          )}
        </div>
        <p className="text-xs text-ink-2 mt-0.5">{match.description}</p>
        <p className="font-mono text-[11px] text-ink-3 mt-1 truncate selectable">
          {match.packageName}
        </p>
      </div>
    </li>
  );
}
