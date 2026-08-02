import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Boxes } from "lucide-react";
import { jobService } from "@/services";
import { useAppStore, notify } from "@/stores/appStore";

const PACKAGE_PATTERN = /\.(apk|xapk|apks|apkm)$/i;

export function DropZone() {
  const [active, setActive] = useState(false);
  const depth = useRef(0);
  const navigate = useNavigate();
  const preferred = useAppStore((s) => s.preferredDevice)();

  useEffect(() => {
    const isFileDrag = (event: DragEvent): boolean =>
      Array.from(event.dataTransfer?.types ?? []).includes("Files");

    const onEnter = (event: DragEvent): void => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      depth.current += 1;
      setActive(true);
    };

    const onOver = (event: DragEvent): void => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };

    const onLeave = (event: DragEvent): void => {
      if (!isFileDrag(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setActive(false);
    };

    const onDrop = async (event: DragEvent): Promise<void> => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      depth.current = 0;
      setActive(false);

      const bridge = window.electronAPI;
      if (!bridge) return;

      const files = Array.from(event.dataTransfer?.files ?? []);
      const installable = files
        .map((file) => bridge.getPathForFile(file))
        .filter((path) => path && PACKAGE_PATTERN.test(path));

      if (installable.length === 0) {
        notify.error(
          "No installable packages",
          "Drop .apk, .xapk, .apks, or .apkm files.",
        );
        return;
      }

      try {
        const result = await jobService.createFromPaths(
          installable,
          preferred?.serial,
        );
        notify.success(
          `Queued ${result.queued} install${result.queued === 1 ? "" : "s"}`,
          preferred
            ? `Target: ${preferred.model || preferred.serial}`
            : "The first available device will be used",
        );
        navigate("/downloads");
      } catch (error) {
        notify.error(
          "Could not queue installs",
          error instanceof Error ? error.message : undefined,
        );
      }
    };

    const onDropEvent = (event: DragEvent): void => void onDrop(event);

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDropEvent);

    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDropEvent);
    };
  }, [navigate, preferred]);

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-canvas/80 backdrop-blur-sm pointer-events-none">
      <div className="m-8 flex-1 max-w-2xl rounded-2xl border-2 border-dashed border-signal/60 bg-signal/[0.04] py-16 px-8 text-center">
        <Boxes className="w-12 h-12 text-signal mx-auto mb-4" />
        <p className="font-display text-xl font-semibold text-ink">
          Drop to install
        </p>
        <p className="text-sm text-ink-2 mt-2">
          Release .apk, .xapk, .apks, or .apkm files to queue them all.
        </p>
      </div>
    </div>
  );
}
