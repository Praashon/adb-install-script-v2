import { SourceRepository } from "@core/database/repositories/sourceRepository";
import { AdapterRepository } from "@core/database/repositories/adapterRepository";
import { DetectionResult } from "./types";
const DIRECT_APK_EXTENSIONS = [".apk", ".xapk", ".apks"];
export class SourceDetector {
  private adapterRepo?: AdapterRepository;
  constructor(
    private sourceRepo: SourceRepository,
    adapterRepo?: AdapterRepository,
  ) {
    this.adapterRepo = adapterRepo;
  }
  async detect(rawUrl: string): Promise<DetectionResult> {
    const url = rawUrl.trim();
    if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
      return { type: "unknown", confidence: 0, url };
    }
    const directResult = this.checkDirectApk(url);
    if (directResult) return directResult;
    const sourceResult = this.matchKnownSource(url);
    if (sourceResult) return sourceResult;
    return {
      type: "unknown",
      confidence: 0,
      url,
      domain: this.extractDomain(url),
    };
  }
  private checkDirectApk(url: string): DetectionResult | null {
    const urlLower = url.toLowerCase();
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();
    for (const ext of DIRECT_APK_EXTENSIONS) {
      if (pathname.endsWith(ext)) {
        return {
          type: "direct_apk",
          confidence: 95,
          domain: parsed.hostname,
          fileExtension: ext.replace(".", ""),
          url,
        };
      }
    }
    const contentDispositionHints = ["download", "dl", "get", "fetch"];
    const hasDownloadPath = contentDispositionHints.some((hint) =>
      pathname.includes(hint),
    );
    for (const ext of DIRECT_APK_EXTENSIONS) {
      if (urlLower.includes(ext)) {
        return {
          type: "direct_apk",
          confidence: hasDownloadPath ? 80 : 60,
          domain: parsed.hostname,
          fileExtension: ext.replace(".", ""),
          url,
        };
      }
    }
    return null;
  }
  private matchKnownSource(url: string): DetectionResult | null {
    const domain = this.extractDomain(url);
    if (!domain) return null;
    const source = this.sourceRepo.findByDomain(domain);
    if (!source) {
      const baseDomain = this.extractBaseDomain(domain);
      if (baseDomain !== domain) {
        const baseSource = this.sourceRepo.findByDomain(baseDomain);
        if (baseSource) {
          return {
            type: "known_source",
            confidence: 85,
            domain: baseDomain,
            sourceId: baseSource.id,
            sourceName: baseSource.name,
            url,
          };
        }
      }
      return null;
    }
    const hasActiveAdapter = this.adapterRepo
      ? this.adapterRepo.findActiveBySourceId(source.id) !== undefined
      : true;
    return {
      type: "known_source",
      confidence: hasActiveAdapter ? 95 : 70,
      domain,
      sourceId: source.id,
      sourceName: source.name,
      url,
    };
  }
  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }
  private extractBaseDomain(domain: string): string {
    const parts = domain.split(".");
    if (parts.length <= 2) return domain;
    return parts.slice(-2).join(".");
  }
}
