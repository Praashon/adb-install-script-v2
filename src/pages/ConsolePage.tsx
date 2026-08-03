import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ScrollText,
  Play,
  Square,
  Eraser,
  Search,
  Smartphone,
  Cpu,
  MemoryStick,
  ArrowDownToLine,
} from "lucide-react";
import { deviceService, onAppEvent } from "@/services";
import { useAppStore, notify } from "@/stores/appStore";
import { cn } from "@/lib/utils";
import type {
  LogLine,
  LogLevel,
  LogcatBatch,
  DevicePerformance,
} from "../../electron/preload";

const LEVEL_RANK: Record<LogLevel, number> = {
  V: 0,
  D: 1,
  I: 2,
  W: 3,
  E: 4,
  F: 5,
};
const LEVEL_ORDER: LogLevel[] = ["V", "D", "I", "W", "E", "F"];
const LEVEL_STYLE: Record<LogLevel, string> = {
  V: "text-ink-3",
  D: "text-ink-3",
  I: "text-ink-2",
  W: "text-caution",
  E: "text-fault",
  F: "text-fault",
};
const MAX_LINES = 2500;

export function ConsolePage() {
  const navigate = useNavigate();
  const devices = useAppStore((s) => s.devices);
  const preferred = useAppStore((s) => s.preferredDevice)();
  const onlineDevices = devices.filter((d) => d.status === "online");

  const [serial, setSerial] = useState(
    preferred?.serial ?? onlineDevices[0]?.serial ?? "",
  );
  const activeSerial = serial || preferred?.serial || onlineDevices[0]?.serial;

  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [minLevel, setMinLevel] = useState<LogLevel>("V");
  const [query, setQuery] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [perf, setPerf] = useState<DevicePerformance | null>(null);

  const viewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeSerial) return;
    let active = true;
    deviceService
      .logcatStatus(activeSerial)
      .then((s) => active && setRunning(s.running))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [activeSerial]);

  useEffect(() => {
    const unsubscribe = onAppEvent((event, payload) => {
      if (event !== "logcat:batch") return;
      const batch = (payload as { data?: LogcatBatch }).data;
      if (!batch || batch.serial !== activeSerial) return;
      setLines((prev) => {
        const next = prev.concat(batch.lines);
        return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
      });
    });
    return unsubscribe;
  }, [activeSerial]);

  useEffect(() => {
    if (!activeSerial || !running) return;
    let active = true;
    const poll = (): void => {
      deviceService
        .performance(activeSerial)
        .then((p) => active && setPerf(p))
        .catch(() => undefined);
    };
    poll();
    const timer = setInterval(poll, 2500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [activeSerial, running]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const floor = LEVEL_RANK[minLevel];
    return lines.filter(
      (line) =>
        LEVEL_RANK[line.level] >= floor &&
        (!needle ||
          line.message.toLowerCase().includes(needle) ||
          line.tag.toLowerCase().includes(needle)),
    );
  }, [lines, minLevel, query]);

  useEffect(() => {
    if (!autoScroll) return;
    const view = viewRef.current;
    if (view) view.scrollTop = view.scrollHeight;
  }, [filtered, autoScroll]);

  const start = async (): Promise<void> => {
    if (!activeSerial) return;
    try {
      await deviceService.logcatStart(activeSerial);
      setRunning(true);
    } catch (error) {
      notify.error(
        "Could not start logcat",
        error instanceof Error ? error.message : undefined,
      );
    }
  };

  const stop = async (): Promise<void> => {
    if (!activeSerial) return;
    try {
      await deviceService.logcatStop(activeSerial);
      setRunning(false);
    } catch (error) {
      notify.error(
        "Could not stop logcat",
        error instanceof Error ? error.message : undefined,
      );
    }
  };

  const clear = async (): Promise<void> => {
    setLines([]);
    if (activeSerial) await deviceService.logcatClear(activeSerial).catch(() => undefined);
  };

  if (onlineDevices.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-8 py-10">
        <ConsoleHeader />
        <div className="panel p-8 text-center">
          <Smartphone className="w-10 h-10 text-ink-3 mx-auto mb-3" />
          <p className="text-sm text-ink-2">No device connected.</p>
          <p className="text-xs text-ink-3 mt-1 mb-5">
            Connect a device to stream its live system log.
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
    <div className="max-w-5xl mx-auto px-8 py-10 h-full flex flex-col">
      <ConsoleHeader />

      <section className="will-enter panel p-3 mb-4 flex items-center gap-2 flex-wrap">
        {onlineDevices.length > 1 ? (
          <select
            className="input py-2 w-auto"
            value={activeSerial}
            onChange={(e) => setSerial(e.target.value)}
          >
            {onlineDevices.map((d) => (
              <option key={d.serial} value={d.serial}>
                {d.model || d.serial}
              </option>
            ))}
          </select>
        ) : (
          <span className="flex items-center gap-2 text-sm text-ink-2 px-1">
            <Smartphone className="w-4 h-4 text-signal" />
            {onlineDevices[0].model || onlineDevices[0].serial}
          </span>
        )}

        {running ? (
          <button className="btn-secondary text-fault border-fault/40" onClick={() => void stop()}>
            <Square className="w-3.5 h-3.5 fill-current" />
            Stop
          </button>
        ) : (
          <button className="btn-primary" onClick={() => void start()}>
            <Play className="w-4 h-4" />
            Start
          </button>
        )}

        <button className="btn-ghost" onClick={() => void clear()}>
          <Eraser className="w-4 h-4" />
          Clear
        </button>

        <div className="relative flex-1 min-w-[10rem]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            className="input pl-9 py-2 font-mono text-xs"
            placeholder="Filter tag or message"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
          />
        </div>

        <select
          className="input py-2 w-auto"
          value={minLevel}
          onChange={(e) => setMinLevel(e.target.value as LogLevel)}
          title="Minimum level"
        >
          {LEVEL_ORDER.map((lvl) => (
            <option key={lvl} value={lvl}>
              {lvl}+
            </option>
          ))}
        </select>

        <button
          className={cn(
            "btn-icon",
            autoScroll ? "text-signal bg-signal/10" : "",
          )}
          onClick={() => setAutoScroll((v) => !v)}
          title={autoScroll ? "Auto-scroll on" : "Auto-scroll off"}
        >
          <ArrowDownToLine className="w-4 h-4" />
        </button>
      </section>

      {perf && running && (
        <section className="will-enter flex items-center gap-4 mb-4">
          <Metric
            icon={Cpu}
            label="CPU"
            value={perf.cpuPercent !== null ? `${perf.cpuPercent}%` : "n/a"}
            ratio={perf.cpuPercent ?? 0}
          />
          <Metric
            icon={MemoryStick}
            label="Memory"
            value={
              perf.memUsedPercent !== null
                ? `${perf.memUsedPercent}% of ${perf.memTotalMb} MB`
                : "n/a"
            }
            ratio={perf.memUsedPercent ?? 0}
          />
        </section>
      )}

      <div
        ref={viewRef}
        className="panel flex-1 min-h-0 overflow-auto p-3 font-mono text-xs leading-relaxed"
        onScroll={(e) => {
          const el = e.currentTarget;
          const atBottom =
            el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          if (atBottom !== autoScroll) setAutoScroll(atBottom);
        }}
      >
        {filtered.length === 0 ? (
          <p className="text-ink-3 text-center py-10">
            {running
              ? "Waiting for log output..."
              : "Press Start to stream the device log."}
          </p>
        ) : (
          filtered.map((line) => (
            <div key={line.id} className="flex gap-2 whitespace-pre-wrap break-all">
              <span className={cn("shrink-0 font-semibold", LEVEL_STYLE[line.level])}>
                {line.level}
              </span>
              {line.tag && <span className="text-signal shrink-0">{line.tag}</span>}
              <span className="text-ink-2">{line.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ConsoleHeader() {
  return (
    <header className="will-enter mb-5">
      <p className="eyebrow mb-3 flex items-center gap-2">
        <ScrollText className="w-3.5 h-3.5 text-signal" />
        Live console
      </p>
      <h1 className="font-display text-[2rem] leading-[1.1] font-semibold tracking-[-0.02em] text-ink">
        Watch the device log.
      </h1>
    </header>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  ratio,
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
  ratio: number;
}) {
  const clamped = Math.max(0, Math.min(100, ratio));
  return (
    <div className="inset-panel px-3.5 py-2.5 flex-1">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="eyebrow flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5 text-signal" />
          {label}
        </span>
        <span className="text-xs text-ink-2 tabular-nums">{value}</span>
      </div>
      <div className="rail-seg">
        <div
          className="rail-seg-fill"
          style={{
            width: `${clamped}%`,
            background:
              clamped > 85 ? "rgb(var(--fault))" : "rgb(var(--signal))",
          }}
        />
      </div>
    </div>
  );
}
