import { pathToFileURL } from "url";

export function isTrustedRendererUrl(url: string, rendererPath: string, developmentUrl?: string): boolean {
  try {
    const actual = new URL(url);
    const expected = new URL(developmentUrl ?? pathToFileURL(rendererPath).href);
    // Hash routing is allowed; other local files and other dev-server paths are not.
    return actual.protocol === expected.protocol && actual.host === expected.host &&
      actual.pathname === expected.pathname && actual.search === expected.search &&
      !actual.username && !actual.password;
  } catch { return false; }
}

export function externalHttpUrl(value: string): string {
  if (typeof value !== "string" || value.length > 8192) throw new Error("Invalid external URL");
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Only HTTP(S) links without credentials may be opened");
  }
  return url.href;
}
