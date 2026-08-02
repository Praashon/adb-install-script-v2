import { useEffect, useState } from "react";
import { Minus, Square, Copy, X } from "lucide-react";
import { onAppEvent } from "@/services";
import { useAppStore } from "@/stores/appStore";
import { cn } from "@/lib/utils";

export function TitleBar() {
  const isMac = navigator.userAgent.toLowerCase().includes("mac");
  const [isMaximized, setIsMaximized] = useState(false);

  const devices = useAppStore((s) => s.devices);
  const adbAvailable = useAppStore((s) => s.adbAvailable);

  const online = devices.filter((d) => d.status === "online").length;

  useEffect(() => {
    // The bridge is absent when the preload script fails to load. The window
    // controls simply go inert rather than taking the whole renderer down.
    if (isMac || !window.electronAPI) return;

    void window.electronAPI.window
      .isMaximized()
      .then(setIsMaximized)
      .catch(() => undefined);

    return onAppEvent((event, data) => {
      if (event === "window:state") {
        setIsMaximized(
          Boolean((data as { maximized?: boolean } | undefined)?.maximized),
        );
      }
    });
  }, [isMac]);

  // The link state belongs in the chrome: it is true everywhere in the app.
  const link = !adbAvailable ? (
    <>
      <span className="status-dot bg-fault" />
      <span className="text-ink-3">adb offline</span>
    </>
  ) : online > 0 ? (
    <>
      <span className="status-dot bg-verify" />
      <span className="text-ink-3">
        {online} device{online === 1 ? "" : "s"}
      </span>
    </>
  ) : (
    <>
      <span className="status-dot bg-ink-3" />
      <span className="text-ink-3">no device</span>
    </>
  );

  const identity = (
    <div className="flex items-center gap-3 px-4 h-full">
      <span className="font-display text-[13px] font-semibold tracking-tight text-ink">
        ADB Bench
      </span>
      <span className="w-px h-3 bg-line" />
      <span className="flex items-center gap-1.5 font-mono text-eyebrow uppercase">
        {link}
      </span>
    </div>
  );

  if (isMac) {
    return (
      <div className="h-9 drag-region bg-canvas border-b border-line flex items-center justify-center w-full">
        {identity}
      </div>
    );
  }

  return (
    <div className="h-9 drag-region bg-canvas border-b border-line flex justify-between items-center w-full select-none relative z-50">
      {identity}

      <div className="flex h-full no-drag">
        <WindowButton
          onClick={() => window.electronAPI?.window.minimize()}
          label="Minimize window"
        >
          <Minus className="w-3.5 h-3.5" />
        </WindowButton>
        <WindowButton
          onClick={() => window.electronAPI?.window.maximize()}
          label={isMaximized ? "Restore window" : "Maximize window"}
        >
          {isMaximized ? (
            <Copy className="w-3 h-3" />
          ) : (
            <Square className="w-3 h-3" />
          )}
        </WindowButton>
        <WindowButton
          onClick={() => window.electronAPI?.window.close()}
          label="Close window"
          danger
        >
          <X className="w-3.5 h-3.5" />
        </WindowButton>
      </div>
    </div>
  );
}

function WindowButton({
  onClick,
  label,
  danger = false,
  children,
}: {
  onClick: () => void;
  label: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={cn(
        "h-full px-4 flex items-center justify-center text-ink-3 transition-colors duration-150",
        danger ? "hover:bg-fault hover:text-white" : "hover:bg-inset hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
