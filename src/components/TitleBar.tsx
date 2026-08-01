import { useEffect, useState } from "react";
import { Minus, Square, Copy, X } from "lucide-react";
import { onAppEvent } from "@/services";
export function TitleBar() {
  const isMac = navigator.userAgent.toLowerCase().includes("mac");
  const [isMaximized, setIsMaximized] = useState(false);
  useEffect(() => {
    if (isMac) return;
    void window.electronAPI.window
      .isMaximized()
      .then(setIsMaximized)
      .catch(() => undefined);
    return onAppEvent((event, data) => {
      if (event === "window:state") {
        setIsMaximized(
          Boolean(
            (
              data as
                | {
                    maximized?: boolean;
                  }
                | undefined
            )?.maximized,
          ),
        );
      }
    });
  }, [isMac]);
  if (isMac) {
    return <div className="h-8 drag-region bg-surface-500 w-full" />;
  }
  return (
    <div className="h-8 drag-region bg-surface-500 flex justify-between items-center w-full select-none z-50 relative">
      <div className="pl-4 text-xs font-medium text-slate-400">
        ADB APK Installer Pro
      </div>

      <div className="flex h-full no-drag">
        <button
          onClick={() => window.electronAPI.window.minimize()}
          className="h-full px-4 text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] transition-colors flex items-center justify-center"
          aria-label="Minimize window"
        >
          <Minus className="w-4 h-4" />
        </button>
        <button
          onClick={() => window.electronAPI.window.maximize()}
          className="h-full px-4 text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] transition-colors flex items-center justify-center"
          aria-label={isMaximized ? "Restore window" : "Maximize window"}
        >
          {isMaximized ? (
            <Copy className="w-3.5 h-3.5" />
          ) : (
            <Square className="w-3.5 h-3.5" />
          )}
        </button>
        <button
          onClick={() => window.electronAPI.window.close()}
          className="h-full px-4 text-slate-400 hover:text-white hover:bg-danger transition-colors flex items-center justify-center"
          aria-label="Close window"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
