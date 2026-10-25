import { safeFetch } from "@security-engine/network";
import { SandboxedAdapter } from "@security-engine/sandbox";
import { EventBus } from "@core/event-bus/eventBus";
export type DownloadStrategyType = "direct" | "html" | "browser" | "redirect";
export interface ResolvedDownload {
  url: string;
  filename: string;
  fileSize?: number;
  mimeType?: string;
  strategy: DownloadStrategyType;
  headers?: Record<string, string>;
}
export class DownloadResolver {
  constructor(private eventBus: EventBus) {}
  async resolve(
    url: string,
    adapter?: SandboxedAdapter,
  ): Promise<ResolvedDownload> {
    if (this.isDirectApkUrl(url)) {
      this.eventBus.download("info", "Direct APK URL detected", { url });
      return this.resolveDirectUrl(url);
    }
    if (adapter) {
      const strategy = adapter.getDownloadStrategy() as DownloadStrategyType;
      this.eventBus.download("info", `Using adapter strategy: ${strategy}`, {
        url,
      });
      return {
        url,
        filename: this.extractFilename(url),
        strategy,
        headers: adapter.getAllHeaders(),
      };
    }
    this.eventBus.download(
      "info",
      "No adapter, attempting redirect resolution",
      { url },
    );
    return this.resolveDirectUrl(url);
  }
  private async resolveDirectUrl(url: string): Promise<ResolvedDownload> {
    try {
      const response = await safeFetch(url, { method: "HEAD", redirect: "follow" });
      const contentType = response.headers.get("content-type") || "";
      const contentLength = response.headers.get("content-length");
      const disposition = response.headers.get("content-disposition") || "";
      const finalUrl = response.url;
      let filename = this.extractFilename(finalUrl);
      const filenameMatch = disposition.match(/filename[*]?=["']?([^"';\n]+)/);
      if (filenameMatch) {
        filename = filenameMatch[1].trim();
      }
      return {
        url: finalUrl,
        filename,
        fileSize: contentLength ? parseInt(contentLength, 10) : undefined,
        mimeType: contentType,
        strategy: "direct",
      };
    } catch {
      return {
        url,
        filename: this.extractFilename(url),
        strategy: "direct",
      };
    }
  }
  private isDirectApkUrl(url: string): boolean {
    try {
      const pathname = new URL(url).pathname.toLowerCase();
      return [".apk", ".xapk", ".apks"].some((ext) => pathname.endsWith(ext));
    } catch {
      return false;
    }
  }
  private extractFilename(url: string): string {
    try {
      const pathname = new URL(url).pathname;
      const segments = pathname.split("/");
      const last = segments[segments.length - 1];
      if (last && last.includes(".")) return decodeURIComponent(last);
    } catch {}
    return "download.apk";
  }
}
