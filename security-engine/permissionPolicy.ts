export interface AllowedOperations {
  cssSelectors: boolean;
  urlPatterns: boolean;
  httpHeaders: boolean;
  regexPatterns: boolean;
  integerValues: boolean;
  booleanFlags: boolean;
  stringArrays: boolean;
  metadataExtraction: boolean;
}
export const DEFAULT_PERMISSIONS: AllowedOperations = {
  cssSelectors: true,
  urlPatterns: true,
  httpHeaders: true,
  regexPatterns: true,
  integerValues: true,
  booleanFlags: true,
  stringArrays: true,
  metadataExtraction: true,
};
const BLOCKED_PATTERNS = [
  /\beval\b/i,
  /\bFunction\b/,
  /\brequire\b/,
  /\bimport\b/,
  /\bprocess\b/,
  /\bchild_process\b/,
  /\bexec\b/i,
  /\bspawn\b/,
  /\bfs\b/,
  /\bpath\b\./,
  /\b__dirname\b/,
  /\b__filename\b/,
  /\bglobal\b/,
  /\bwindow\b/,
  /\bdocument\b/,
  /\bfetch\b/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /javascript:/i,
  /data:text\/html/i,
  /<script/i,
  /\bon\w+\s*=/i,
  /\bshell\b/,
  /\bcmd\b/,
  /\bpowershell\b/i,
  /\brm\s+-rf\b/,
  /\bformat\b.*\bc:\b/i,
];
const ALLOWED_TOP_LEVEL_KEYS = new Set([
  "version",
  "parserType",
  "rules",
  "downloadStrategy",
  "urlPatterns",
  "metadata",
  "headers",
]);
const ALLOWED_RULE_KEYS = new Set([
  "downloadPageSelector",
  "downloadLinkSelector",
  "appNameSelector",
  "versionSelector",
  "sizeSelector",
  "packageNameSelector",
  "fallbackSelectors",
  "downloadButtonText",
  "linkPattern",
  "excludePatterns",
]);
const ALLOWED_METADATA_KEYS = new Set([
  "requiresBrowser",
  "hasRedirects",
  "maxRedirects",
  "timeout",
  "userAgent",
  "waitForSelector",
  "waitTimeout",
]);
export function containsBlockedPattern(value: string): string | null {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(value)) {
      return `Blocked pattern detected: ${pattern.source}`;
    }
  }
  return null;
}
export function validateKeys(
  obj: Record<string, unknown>,
  allowed: Set<string>,
  context: string,
): string[] {
  const errors: string[] = [];
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      errors.push(`Unknown key "${key}" in ${context}`);
    }
  }
  return errors;
}
export function scanStringValues(obj: unknown, path: string = ""): string[] {
  const errors: string[] = [];
  if (typeof obj === "string") {
    const blocked = containsBlockedPattern(obj);
    if (blocked) {
      errors.push(`${path}: ${blocked}`);
    }
  } else if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      errors.push(...scanStringValues(obj[i], `${path}[${i}]`));
    }
  } else if (obj !== null && typeof obj === "object") {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      errors.push(...scanStringValues(value, path ? `${path}.${key}` : key));
    }
  }
  return errors;
}
export {
  ALLOWED_TOP_LEVEL_KEYS,
  ALLOWED_RULE_KEYS,
  ALLOWED_METADATA_KEYS,
  BLOCKED_PATTERNS,
};
