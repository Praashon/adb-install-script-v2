import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Database,
  FileCode,
  FlaskConical,
  Pencil,
  Trash2,
  Upload,
  Download as DownloadIcon,
  RefreshCw,
  Power,
  ExternalLink,
} from "lucide-react";
import { appService, sourceService } from "@/services";
import { useAppStore, notify } from "@/stores/appStore";
import { Modal, ConfirmDialog } from "@/components/Modal";
import { cn, formatDate } from "@/lib/utils";
import type { AdapterRules, Source, SourceDetail } from "@/types";
import type { SourceTestResult } from "../../electron/preload";
export function SourcesPage() {
  const sources = useAppStore((s) => s.sources);
  const setSources = useAppStore((s) => s.setSources);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [testTarget, setTestTarget] = useState<Source | null>(null);
  const [editTarget, setEditTarget] = useState<Source | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Source | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const navigate = useNavigate();
  const load = useCallback(async () => {
    try {
      setSources(await sourceService.getAll());
    } catch (error) {
      notify.error(
        "Could not load sources",
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setIsLoading(false);
    }
  }, [setSources]);
  useEffect(() => {
    void load();
  }, [load]);
  const importPlugin = async (): Promise<void> => {
    try {
      const result = await sourceService.importPlugin();
      if (result.cancelled) return;
      await load();
      notify.success("Plugin imported");
    } catch (error) {
      notify.error(
        "Import failed",
        error instanceof Error ? error.message : undefined,
      );
    }
  };
  const exportPlugin = async (source: Source): Promise<void> => {
    setBusyId(source.id);
    try {
      const result = await sourceService.exportPlugin(source.id);
      if (!result.cancelled) notify.success("Plugin exported", result.filePath);
    } catch (error) {
      notify.error(
        "Export failed",
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setBusyId(null);
    }
  };
  const toggleEnabled = async (source: Source): Promise<void> => {
    const enable = source.status === "disabled";
    setBusyId(source.id);
    try {
      await sourceService.setEnabled(source.id, enable);
      await load();
      notify.success(
        enable ? `${source.name} enabled` : `${source.name} disabled`,
      );
    } catch (error) {
      notify.error(
        "Could not update source",
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setBusyId(null);
    }
  };
  const reload = async (): Promise<void> => {
    try {
      const result = await sourceService.reload();
      await load();
      if (result.failed.length > 0) {
        notify.warning(
          `${result.loaded} adapter(s) loaded, ${result.failed.length} failed`,
          result.failed.map((f) => `${f.plugin}: ${f.error}`).join("\n"),
        );
      } else {
        notify.success(`${result.loaded} adapter(s) reloaded`);
      }
    } catch (error) {
      notify.error(
        "Reload failed",
        error instanceof Error ? error.message : undefined,
      );
    }
  };
  const confirmDelete = async (): Promise<void> => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await sourceService.remove(deleteTarget.id);
      await load();
      notify.success(`${deleteTarget.name} removed`);
      setDeleteTarget(null);
    } catch (error) {
      notify.error(
        "Could not remove source",
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setIsDeleting(false);
    }
  };
  return (
    <div className="max-w-5xl mx-auto py-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 mb-1">
            Source Adapters
          </h1>
          <p className="text-slate-400">
            Manage supported APK websites and custom plugins
          </p>
        </div>
        <div className="flex gap-3">
          <button
            className="btn-secondary"
            onClick={() => void reload()}
            title="Re-read plugins from disk"
          >
            <RefreshCw className="w-4 h-4" />
            Reload
          </button>
          <button className="btn-secondary" onClick={() => void importPlugin()}>
            <Upload className="w-4 h-4" />
            Import Plugin
          </button>
          <button
            className="btn-primary"
            onClick={() => navigate("/sources/add")}
          >
            <Plus className="w-4 h-4" />
            Add New Source
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sources.map((source, i) => (
          <SourceCard
            key={source.id}
            source={source}
            index={i}
            busy={busyId === source.id}
            onTest={() => setTestTarget(source)}
            onEdit={() => setEditTarget(source)}
            onExport={() => void exportPlugin(source)}
            onToggle={() => void toggleEnabled(source)}
            onDelete={() => setDeleteTarget(source)}
          />
        ))}

        {sources.length === 0 && !isLoading && (
          <div className="col-span-full py-12 text-center card border-dashed">
            <Database className="w-12 h-12 text-slate-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-300 mb-2">
              No Sources Found
            </h3>
            <p className="text-slate-500 mb-6">
              Built-in adapters failed to load. Reload them, or create one from
              any website.
            </p>
            <div className="flex justify-center gap-3">
              <button className="btn-secondary" onClick={() => void reload()}>
                <RefreshCw className="w-4 h-4" />
                Reload built-ins
              </button>
              <button
                className="btn-primary"
                onClick={() => navigate("/sources/add")}
              >
                <Plus className="w-4 h-4" />
                Add source
              </button>
            </div>
          </div>
        )}
      </div>

      <TestSourceModal
        source={testTarget}
        onClose={() => setTestTarget(null)}
      />
      <EditSourceModal
        source={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => {
          setEditTarget(null);
          void load();
        }}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Remove source?"
        message={`${deleteTarget?.name} and its adapter rules will be deleted. Built-in adapters come back when you reload plugins.`}
        confirmLabel="Remove"
        danger
        busy={isDeleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "healthy":
      return <CheckCircle2 className="w-5 h-5 text-success-light" />;
    case "broken":
      return <XCircle className="w-5 h-5 text-danger-light" />;
    case "degraded":
      return <AlertTriangle className="w-5 h-5 text-warning-light" />;
    default:
      return <Power className="w-5 h-5 text-slate-500" />;
  }
}
function SourceCard({
  source,
  index,
  busy,
  onTest,
  onEdit,
  onExport,
  onToggle,
  onDelete,
}: {
  source: Source;
  index: number;
  busy: boolean;
  onTest: () => void;
  onEdit: () => void;
  onExport: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const disabled = source.status === "disabled";
  return (
    <div
      className={cn(
        "card transition-all animate-slide-up group flex flex-col",
        disabled ? "opacity-60" : "hover:border-accent/30",
      )}
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
              source.isBuiltIn
                ? "bg-accent/10 text-accent"
                : "bg-purple-500/10 text-purple-400",
            )}
          >
            {source.isBuiltIn ? (
              <Database className="w-5 h-5" />
            ) : (
              <FileCode className="w-5 h-5" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-200 truncate">
              {source.name}
            </h3>
            <p className="text-xs text-slate-400 truncate">{source.domain}</p>
          </div>
        </div>
        <StatusIcon status={source.status} />
      </div>

      <div className="divider" />

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-slate-500 mb-1 text-xs uppercase tracking-wider">
            Success Rate
          </div>
          <div className="font-medium text-slate-200">
            {Math.round(source.successRate)}%
            {source.totalAttempts > 0 && (
              <span className="text-xs text-slate-500 ml-1">
                ({source.totalAttempts})
              </span>
            )}
          </div>
        </div>
        <div>
          <div className="text-slate-500 mb-1 text-xs uppercase tracking-wider">
            Version
          </div>
          <div className="font-medium text-slate-200">
            v{source.activeAdapterVersion}
          </div>
        </div>
      </div>

      {source.lastTested && (
        <p className="text-xs text-slate-500 mt-3">
          Last tested {formatDate(source.lastTested)}
        </p>
      )}

      {!source.hasAdapter && (
        <p className="text-xs text-warning-light mt-3">
          No adapter rules loaded - generic extraction will be used.
        </p>
      )}

      <div className="mt-auto pt-4 mt-4 border-t border-white/[0.06] grid grid-cols-2 gap-2">
        <button
          className="btn-secondary py-1.5 text-xs"
          onClick={onTest}
          disabled={busy}
        >
          <FlaskConical className="w-3.5 h-3.5" />
          Test
        </button>
        <button
          className="btn-secondary py-1.5 text-xs"
          onClick={onEdit}
          disabled={busy}
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </button>
        <button
          className="btn-secondary py-1.5 text-xs"
          onClick={onExport}
          disabled={busy}
        >
          <DownloadIcon className="w-3.5 h-3.5" />
          Export
        </button>
        <button
          className="btn-secondary py-1.5 text-xs"
          onClick={onToggle}
          disabled={busy}
        >
          <Power className="w-3.5 h-3.5" />
          {disabled ? "Enable" : "Disable"}
        </button>
        <button
          className="btn-secondary py-1.5 text-xs col-span-2 hover:text-danger-light hover:border-danger/30"
          onClick={onDelete}
          disabled={busy}
        >
          <Trash2 className="w-3.5 h-3.5" />
          Remove
        </button>
      </div>
    </div>
  );
}
function TestSourceModal({
  source,
  onClose,
}: {
  source: Source | null;
  onClose: () => void;
}) {
  const [testUrl, setTestUrl] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<SourceTestResult | null>(null);
  useEffect(() => {
    setTestUrl(source?.url ?? "");
    setResult(null);
  }, [source]);
  const run = async (): Promise<void> => {
    if (!source) return;
    setIsRunning(true);
    setResult(null);
    try {
      setResult(
        await sourceService.test(source.id, testUrl.trim() || undefined),
      );
    } catch (error) {
      setResult({
        success: false,
        reachable: false,
        message: error instanceof Error ? error.message : "Test failed",
        durationMs: 0,
      });
    } finally {
      setIsRunning(false);
    }
  };
  return (
    <Modal
      open={Boolean(source)}
      title={`Test ${source?.name ?? ""}`}
      description="Fetches a page and checks whether the adapter selectors still match"
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Close
          </button>
          <button
            className="btn-primary"
            onClick={() => void run()}
            disabled={isRunning}
          >
            {isRunning ? "Testing…" : "Run test"}
          </button>
        </>
      }
    >
      <label className="label">Test URL</label>
      <input
        className="input"
        value={testUrl}
        onChange={(e) => setTestUrl(e.target.value)}
        placeholder={`https://${source?.domain ?? "example.com"}/some-app`}
        spellCheck={false}
      />
      <p className="text-xs text-slate-500 mt-2">
        Point this at a real app page for the most accurate result - a homepage
        usually has no download link.
      </p>

      {result && (
        <div
          className={cn(
            "mt-5 rounded-xl border p-4",
            result.success
              ? "border-success/30 bg-success/[0.06]"
              : "border-danger/30 bg-danger/[0.06]",
          )}
        >
          <div className="flex items-center gap-2 mb-2">
            {result.success ? (
              <CheckCircle2 className="w-4 h-4 text-success-light" />
            ) : (
              <XCircle className="w-4 h-4 text-danger-light" />
            )}
            <span
              className={cn(
                "text-sm font-medium",
                result.success ? "text-success-light" : "text-danger-light",
              )}
            >
              {result.success ? "Adapter is working" : "Adapter did not match"}
            </span>
            <span className="text-xs text-slate-500 ml-auto">
              {result.durationMs}ms
            </span>
          </div>
          <p className="text-sm text-slate-300 break-words selectable">
            {result.message}
          </p>
          {result.downloadUrl && (
            <button
              className="text-xs text-accent hover:underline mt-2 inline-flex items-center gap-1"
              onClick={() => void appService.openExternal(result.downloadUrl!)}
            >
              <ExternalLink className="w-3 h-3" />
              Open resolved link
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
const SELECTOR_FIELDS = [
  {
    key: "downloadLinkSelector" as const,
    label: "Download link selector",
    hint: "Primary CSS selector for the direct APK link, e.g. a[href$='.apk']",
  },
  {
    key: "downloadPageSelector" as const,
    label: "Download button selector",
    hint: "Selector for the button that leads to the download page",
  },
  {
    key: "appNameSelector" as const,
    label: "App name selector",
    hint: "Where to read the app title from, e.g. h1.app-name",
  },
  {
    key: "versionSelector" as const,
    label: "Version selector",
    hint: "Optional - where the version string appears",
  },
];
function EditSourceModal({
  source,
  onClose,
  onSaved,
}: {
  source: Source | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [detail, setDetail] = useState<SourceDetail | null>(null);
  const [name, setName] = useState("");
  const [rules, setRules] = useState<AdapterRules["rules"]>({});
  const [strategy, setStrategy] =
    useState<AdapterRules["downloadStrategy"]>("html");
  const [fallbacks, setFallbacks] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  useEffect(() => {
    if (!source) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    sourceService
      .getById(source.id)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        setName(data.name);
        setRules(data.rules?.rules ?? {});
        setStrategy(data.rules?.downloadStrategy ?? "html");
        setFallbacks((data.rules?.rules.fallbackSelectors ?? []).join("\n"));
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          notify.error(
            "Could not load adapter",
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
  }, [source]);
  const save = async (): Promise<void> => {
    if (!source) return;
    setIsSaving(true);
    try {
      const nextRules: AdapterRules = {
        version: detail?.rules?.version ?? 1,
        parserType: detail?.rules?.parserType ?? "html",
        downloadStrategy: strategy,
        rules: {
          ...rules,
          fallbackSelectors: fallbacks
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
        },
        metadata: detail?.rules?.metadata,
        headers: detail?.rules?.headers,
      };
      await sourceService.update(source.id, {
        name: name.trim() || source.name,
        rules: nextRules,
      });
      notify.success("Adapter saved", "A new adapter version was created");
      onSaved();
    } catch (error) {
      notify.error(
        "Could not save adapter",
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setIsSaving(false);
    }
  };
  return (
    <Modal
      open={Boolean(source)}
      title={`Edit ${source?.name ?? ""}`}
      description={source?.domain}
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={() => void save()}
            disabled={isSaving || isLoading}
          >
            {isSaving ? "Saving…" : "Save adapter"}
          </button>
        </>
      }
    >
      {isLoading ? (
        <p className="text-sm text-slate-500 py-8 text-center">
          Loading adapter rules…
        </p>
      ) : (
        <div className="space-y-5">
          <div>
            <label className="label">Adapter name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="label">Download strategy</label>
            <select
              className="input"
              value={strategy}
              onChange={(e) =>
                setStrategy(e.target.value as AdapterRules["downloadStrategy"])
              }
            >
              <option value="html">HTML - parse the page for a link</option>
              <option value="direct">
                Direct - the URL is already the file
              </option>
              <option value="redirect">
                Redirect - follow redirects to the file
              </option>
              <option value="browser">
                Browser - render with a headless browser
              </option>
            </select>
          </div>

          {SELECTOR_FIELDS.map((field) => (
            <div key={field.key}>
              <label className="label">{field.label}</label>
              <input
                className="input-sm"
                value={rules[field.key] ?? ""}
                onChange={(e) =>
                  setRules((prev) => ({ ...prev, [field.key]: e.target.value }))
                }
                placeholder="Leave empty to skip"
                spellCheck={false}
              />
              <p className="text-xs text-slate-500 mt-1">{field.hint}</p>
            </div>
          ))}

          <div>
            <label className="label">Fallback selectors</label>
            <textarea
              className="input-sm min-h-[96px] resize-y"
              value={fallbacks}
              onChange={(e) => setFallbacks(e.target.value)}
              placeholder={"a[href$='.apk']\na.download-btn"}
              spellCheck={false}
            />
            <p className="text-xs text-slate-500 mt-1">
              One selector per line. Tried in order when the primary selectors
              miss.
            </p>
          </div>

          <p className="text-xs text-slate-500 border-t border-white/[0.06] pt-4">
            Saving creates adapter v{(detail?.activeVersion ?? 1) + 1}. Only CSS
            selectors and static values are stored - adapters never execute
            code.
          </p>
        </div>
      )}
    </Modal>
  );
}
