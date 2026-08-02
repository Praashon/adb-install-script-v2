import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { CircleCheck, CircleX, TriangleAlert, Info, X } from "lucide-react";
import { useAppStore, type Toast, type ToastKind } from "@/stores/appStore";
import { prefersReducedMotion } from "@/hooks/useEnterAnimation";
import { cn } from "@/lib/utils";

const AUTO_DISMISS_MS: Record<ToastKind, number> = {
  success: 4000,
  info: 4000,
  warning: 8000,
  error: 10000,
};

const ICONS: Record<ToastKind, typeof CircleCheck> = {
  success: CircleCheck,
  error: CircleX,
  warning: TriangleAlert,
  info: Info,
};

const ACCENT: Record<ToastKind, string> = {
  success: "text-verify",
  error: "text-fault",
  warning: "text-caution",
  info: "text-signal",
};

const RULE: Record<ToastKind, string> = {
  success: "bg-verify",
  error: "bg-fault",
  warning: "bg-caution",
  info: "bg-signal",
};

function ToastCard({ toast }: { toast: Toast }) {
  const dismissToast = useAppStore((s) => s.dismissToast);
  const ref = useRef<HTMLDivElement>(null);
  const Icon = ICONS[toast.kind];

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || prefersReducedMotion()) return;

    const tween = gsap.fromTo(
      node,
      { opacity: 0, x: 24, scale: 0.98 },
      { opacity: 1, x: 0, scale: 1, duration: 0.36, ease: "power3.out" },
    );

    return () => {
      tween.kill();
    };
  }, []);

  useLayoutEffect(() => {
    const timer = setTimeout(
      () => dismissToast(toast.id),
      AUTO_DISMISS_MS[toast.kind],
    );
    return () => clearTimeout(timer);
  }, [toast.id, toast.kind, dismissToast]);

  return (
    <div
      ref={ref}
      role="status"
      className="pointer-events-auto w-[22rem] panel shadow-lifted flex overflow-hidden"
    >
      {/* A single coloured rule instead of tinting the whole card. */}
      <span className={cn("w-[3px] shrink-0", RULE[toast.kind])} />

      <div className="flex items-start gap-2.5 p-3.5 flex-1 min-w-0">
        <Icon className={cn("w-4 h-4 shrink-0 mt-0.5", ACCENT[toast.kind])} />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink leading-snug">
            {toast.title}
          </p>
          {toast.description && (
            <p className="text-xs text-ink-2 mt-1 leading-relaxed break-words selectable">
              {toast.description}
            </p>
          )}
        </div>

        <button
          onClick={() => dismissToast(toast.id)}
          className="text-ink-3 hover:text-ink transition-colors shrink-0"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useAppStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2.5 pointer-events-none">
      {toasts.slice(-4).map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
