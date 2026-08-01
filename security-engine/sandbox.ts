import { AdapterRules } from "./adapterValidator";
import { containsBlockedPattern } from "./permissionPolicy";
export interface SandboxedAdapter {
  rules: AdapterRules;
  getSelector(key: string): string | undefined;
  getFallbackSelectors(): string[];
  getDownloadStrategy(): string;
  getUrlPattern(key: string): string | undefined;
  getHeader(key: string): string | undefined;
  getAllHeaders(): Record<string, string>;
  requiresBrowser(): boolean;
  getMaxRedirects(): number;
  getTimeout(): number;
}
export class AdapterSandbox {
  wrap(rules: AdapterRules): SandboxedAdapter {
    const frozenRules = Object.freeze(JSON.parse(JSON.stringify(rules)));
    return {
      rules: frozenRules,
      getSelector(key: string): string | undefined {
        const value = (frozenRules.rules as Record<string, unknown>)?.[key];
        if (typeof value !== "string") return undefined;
        if (containsBlockedPattern(value)) return undefined;
        return value;
      },
      getFallbackSelectors(): string[] {
        const selectors = frozenRules.rules?.fallbackSelectors;
        if (!Array.isArray(selectors)) return [];
        return selectors.filter((s: unknown): s is string => {
          return typeof s === "string" && !containsBlockedPattern(s);
        });
      },
      getDownloadStrategy(): string {
        return frozenRules.downloadStrategy || "html";
      },
      getUrlPattern(key: string): string | undefined {
        const value = frozenRules.urlPatterns?.[key];
        if (typeof value !== "string") return undefined;
        if (containsBlockedPattern(value)) return undefined;
        return value;
      },
      getHeader(key: string): string | undefined {
        const value = frozenRules.headers?.[key];
        if (typeof value !== "string") return undefined;
        if (containsBlockedPattern(value)) return undefined;
        return value;
      },
      getAllHeaders(): Record<string, string> {
        const headers: Record<string, string> = {};
        if (!frozenRules.headers) return headers;
        for (const [key, value] of Object.entries(frozenRules.headers)) {
          if (typeof value === "string" && !containsBlockedPattern(value)) {
            headers[key] = value;
          }
        }
        return headers;
      },
      requiresBrowser(): boolean {
        return frozenRules.metadata?.requiresBrowser === true;
      },
      getMaxRedirects(): number {
        const value = frozenRules.metadata?.maxRedirects;
        if (typeof value !== "number") return 5;
        return Math.max(0, Math.min(10, value));
      },
      getTimeout(): number {
        const value = frozenRules.metadata?.timeout;
        if (typeof value !== "number") return 30000;
        return Math.max(1000, Math.min(120000, value));
      },
    };
  }
}
