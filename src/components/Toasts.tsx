import { useEffect } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { useAppStore, type Toast, type ToastKind } from "@/stores/appStore";
import { cn } from "@/lib/utils";
const AUTO_DISMISS_MS: Record<ToastKind, number> = {
  success: 4000,
  info: 4000,
  warning: 7000,
  error: 9000,
};
const ICONS: Record<ToastKind, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};
const ACCENTS: Record<ToastKind, string> = {
  success: "border-success/30 text-success-light",
  error: "border-danger/30 text-danger-light",
  warning: "border-warning/30 text-warning-light",
  info: "border-accent/30 text-accent",
};
function ToastCard({ toast }: { toast: Toast }) {
  const dismissToast = useAppStore((s) => s.dismissToast);
  const Icon = ICONS[toast.kind];
  useEffect(() => {
    const timer = setTimeout(
      () => dismissToast(toast.id),
      AUTO_DISMISS_MS[toast.kind],
    );
    return () => clearTimeout(timer);
  }, [toast.id, toast.kind, dismissToast]);
  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto w-80 rounded-xl border bg-surface-300/95 backdrop-blur-md shadow-xl",
        "p-4 flex items-start gap-3 animate-slide-up",
        ACCENTS[toast.kind],
      )}
    >
      <Icon className="w-5 h-5 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-100">{toast.title}</p>
        {toast.description && (
          <p className="text-xs text-slate-400 mt-1 break-words selectable">
            {toast.description}
          </p>
        )}
      </div>
      <button
        onClick={() => dismissToast(toast.id)}
        className="text-slate-500 hover:text-slate-200 transition-colors shrink-0"
        aria-label="Dismiss notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
export function Toasts() {
  const toasts = useAppStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
      {toasts.slice(-4).map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
