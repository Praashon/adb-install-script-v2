import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ArrowLeft,
  Search,
  Code,
  CheckCircle,
  ShieldAlert,
  AlertTriangle,
} from "lucide-react";
import { sourceService } from "@/services";
import { notify } from "@/stores/appStore";
import { cn } from "@/lib/utils";
import type { AdapterRules, AnalysisResult } from "@/types";
export function AddSourceWizard() {
  const [step, setStep] = useState<1 | 2>(1);
  const [url, setUrl] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [adapterName, setAdapterName] = useState("");
  const [linkSelector, setLinkSelector] = useState("");
  const [buttonSelector, setButtonSelector] = useState("");
  const [strategy, setStrategy] =
    useState<AdapterRules["downloadStrategy"]>("html");
  const [isSaving, setIsSaving] = useState(false);
  const navigate = useNavigate();
  const analyze = async (): Promise<void> => {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (!/^https?:\/\//i.test(trimmed)) {
      notify.error(
        "Enter a full URL",
        "It must start with http:// or https://",
      );
      return;
    }
    setIsAnalyzing(true);
    try {
      const result = await sourceService.analyze(trimmed);
      setAnalysis(result);
      setAdapterName(result.metadata.appName || result.title || result.domain);
      setLinkSelector(result.suggestedRules.downloadLinkSelector ?? "");
      setButtonSelector(result.suggestedRules.downloadPageSelector ?? "");
      setStep(2);
    } catch (error) {
      notify.error(
        "Analysis failed",
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setIsAnalyzing(false);
    }
  };
  const save = async (): Promise<void> => {
    if (!analysis) return;
    if (!linkSelector.trim() && !buttonSelector.trim()) {
      notify.error(
        "At least one selector is required",
        "Fill in a download link or button selector",
      );
      return;
    }
    setIsSaving(true);
    try {
      const rules: AdapterRules = {
        version: 1,
        parserType: "html",
        downloadStrategy: strategy,
        rules: {
          ...(linkSelector.trim()
            ? { downloadLinkSelector: linkSelector.trim() }
            : {}),
          ...(buttonSelector.trim()
            ? { downloadPageSelector: buttonSelector.trim() }
            : {}),
          appNameSelector: analysis.suggestedRules.appNameSelector || "h1",
          fallbackSelectors:
            analysis.suggestedRules.fallbackSelectors.filter(Boolean),
        },
        metadata: {
          requiresBrowser: strategy === "browser",
          maxRedirects: 5,
          timeout: 30000,
        },
      };
      await sourceService.create({
        name: adapterName.trim() || analysis.domain,
        domain: analysis.domain,
        rules,
      });
      notify.success("Source adapter created", analysis.domain);
      navigate("/sources");
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
    <div className="max-w-3xl mx-auto py-8">
      <div className="flex items-center gap-4 mb-8">
        <button
          className="btn-icon"
          onClick={() => navigate("/sources")}
          aria-label="Back to sources"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">
            Add Source Adapter
          </h1>
          <p className="text-slate-400">
            Create a new plugin to support downloads from a website
          </p>
        </div>
      </div>

      <div className="flex mb-8">
        <div className="flex-1 border-t-2 border-accent relative">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-surface-500 px-4 text-accent font-semibold text-sm">
            Step 1: Analyze
          </div>
        </div>
        <div
          className={cn(
            "flex-1 border-t-2 relative transition-colors",
            step >= 2 ? "border-accent" : "border-white/[0.06]",
          )}
        >
          <div
            className={cn(
              "absolute -top-3 left-1/2 -translate-x-1/2 bg-surface-500 px-4 font-semibold text-sm transition-colors",
              step >= 2 ? "text-accent" : "text-slate-500",
            )}
          >
            Step 2: Review &amp; Save
          </div>
        </div>
      </div>

      {step === 1 && (
        <div className="card-glass animate-fade-in p-8 text-center">
          <div className="w-16 h-16 bg-accent/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Search className="w-8 h-8 text-accent" />
          </div>
          <h2 className="text-xl font-semibold mb-2 text-slate-100">
            Scan a download page
          </h2>
          <p className="text-slate-400 mb-8 max-w-lg mx-auto">
            Enter a link to a typical app download page on the website. The
            engine analyzes it and generates adapter selectors automatically.
          </p>

          <div className="flex gap-4 max-w-xl mx-auto">
            <input
              className="input flex-1"
              placeholder="https://example.com/app-page"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void analyze();
              }}
              spellCheck={false}
            />
            <button
              className="btn-primary"
              onClick={() => void analyze()}
              disabled={!url.trim() || isAnalyzing}
            >
              {isAnalyzing ? "Scanning…" : "Analyze"}
              {!isAnalyzing && <ArrowRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {step === 2 && analysis && (
        <div className="animate-fade-in space-y-6">
          <div
            className={cn(
              "card flex items-start gap-4",
              analysis.confidence >= 50
                ? "border-success/30 bg-success/5"
                : "border-warning/30 bg-warning/5",
            )}
          >
            {analysis.confidence >= 50 ? (
              <CheckCircle className="w-6 h-6 text-success mt-1 shrink-0" />
            ) : (
              <AlertTriangle className="w-6 h-6 text-warning mt-1 shrink-0" />
            )}
            <div>
              <h3
                className={cn(
                  "text-lg font-medium mb-1",
                  analysis.confidence >= 50
                    ? "text-success-light"
                    : "text-warning-light",
                )}
              >
                {analysis.confidence >= 50
                  ? "Analysis complete"
                  : "Low confidence"}
              </h3>
              <p className="text-slate-300 text-sm">
                Found {analysis.detectedLinks.length} candidate link(s) and{" "}
                {analysis.detectedButtons.length} button(s) on {analysis.domain}{" "}
                - {analysis.confidence}% confidence. Review the selectors below
                before saving.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="card">
              <h3 className="font-medium text-slate-200 mb-4 flex items-center gap-2">
                <Code className="w-4 h-4 text-slate-400" />
                Adapter details
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="label">Adapter name</label>
                  <input
                    className="input"
                    value={adapterName}
                    onChange={(e) => setAdapterName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Domain</label>
                  <input
                    className="input font-mono text-xs"
                    value={analysis.domain}
                    disabled
                  />
                </div>
                <div>
                  <label className="label">Download strategy</label>
                  <select
                    className="input"
                    value={strategy}
                    onChange={(e) =>
                      setStrategy(
                        e.target.value as AdapterRules["downloadStrategy"],
                      )
                    }
                  >
                    <option value="html">HTML - parse the page</option>
                    <option value="direct">Direct - URL is the file</option>
                    <option value="redirect">
                      Redirect - follow redirects
                    </option>
                    <option value="browser">
                      Browser - render with headless browser
                    </option>
                  </select>
                </div>
              </div>
            </div>

            <div className="card">
              <h3 className="font-medium text-slate-200 mb-4 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-slate-400" />
                Generated selectors
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="label text-xs">
                    Download link (primary)
                  </label>
                  <input
                    className="input-sm"
                    value={linkSelector}
                    onChange={(e) => setLinkSelector(e.target.value)}
                    placeholder="None detected"
                    spellCheck={false}
                  />
                </div>
                <div>
                  <label className="label text-xs">
                    Download button (fallback)
                  </label>
                  <input
                    className="input-sm"
                    value={buttonSelector}
                    onChange={(e) => setButtonSelector(e.target.value)}
                    placeholder="None detected"
                    spellCheck={false}
                  />
                </div>
                {analysis.suggestedRules.fallbackSelectors.length > 0 && (
                  <div>
                    <span className="text-slate-500 block text-xs mb-1.5">
                      Extra fallbacks (
                      {analysis.suggestedRules.fallbackSelectors.length})
                    </span>
                    <div className="space-y-1">
                      {analysis.suggestedRules.fallbackSelectors
                        .slice(0, 4)
                        .map((selector) => (
                          <code
                            key={selector}
                            className="block bg-surface-600 px-2 py-1 rounded text-accent text-xs truncate"
                          >
                            {selector}
                          </code>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {analysis.detectedLinks.length > 0 && (
            <div className="card">
              <h3 className="font-medium text-slate-200 mb-3">
                Top candidate links
              </h3>
              <ul className="space-y-2">
                {analysis.detectedLinks.slice(0, 5).map((link) => (
                  <li
                    key={link.url}
                    className="flex items-center gap-3 text-xs"
                  >
                    <span className="badge-neutral shrink-0">
                      {link.confidence}
                    </span>
                    <code
                      className="text-slate-400 truncate flex-1"
                      title={link.url}
                    >
                      {link.url}
                    </code>
                    <button
                      className="text-accent hover:underline shrink-0"
                      onClick={() => setLinkSelector(link.selector)}
                    >
                      Use selector
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-between items-center pt-6 border-t border-white/[0.06]">
            <button
              className="btn-ghost"
              onClick={() => setStep(1)}
              disabled={isSaving}
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <button
              className="btn-primary"
              onClick={() => void save()}
              disabled={isSaving}
            >
              {isSaving ? "Saving…" : "Save & Enable Adapter"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
