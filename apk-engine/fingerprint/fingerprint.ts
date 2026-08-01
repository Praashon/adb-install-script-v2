import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { createHash } from "crypto";
import AdmZip from "adm-zip";
import { FingerprintInfo } from "../types";
export class Fingerprint {
  async generate(filePath: string): Promise<FingerprintInfo> {
    const sha256 = await this.computeSha256(filePath);
    const fileSize = (await stat(filePath)).size;
    const manifest = this.readManifestInfo(filePath);
    const certificate = this.extractCertificate(filePath);
    const architecture = this.detectArchitecture(filePath);
    return {
      sha256,
      packageName: manifest.packageName,
      versionName: manifest.versionName,
      versionCode: manifest.versionCode,
      certificate,
      architecture,
      fileSize,
    };
  }
  private computeSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash("sha256");
      const stream = createReadStream(filePath);
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("end", () => resolve(hash.digest("hex")));
      stream.on("error", reject);
    });
  }
  private readManifestInfo(filePath: string): {
    packageName: string;
    versionName?: string;
    versionCode?: number;
  } {
    try {
      const zip = new AdmZip(filePath);
      const manifestEntry = zip.getEntry("AndroidManifest.xml");
      if (!manifestEntry) {
        return { packageName: "unknown" };
      }
      const data = manifestEntry.getData();
      const packageName =
        this.extractAttributeFromBinaryXml(data, "package") || "unknown";
      const versionName =
        this.extractAttributeFromBinaryXml(data, "versionName") || undefined;
      const versionCodeStr = this.extractAttributeFromBinaryXml(
        data,
        "versionCode",
      );
      const versionCode = versionCodeStr
        ? parseInt(versionCodeStr, 10)
        : undefined;
      return { packageName, versionName, versionCode };
    } catch {
      return { packageName: "unknown" };
    }
  }
  private extractAttributeFromBinaryXml(
    data: Buffer,
    attributeName: string,
  ): string | null {
    const searchStr = attributeName;
    const dataStr = data.toString("utf-8", 0, Math.min(data.length, 8192));
    const patterns = [
      new RegExp(`${searchStr}[\\x00-\\x1f]*([\\x20-\\x7e]{1,128})`, "i"),
      new RegExp(`${searchStr}="([^"]+)"`, "i"),
    ];
    for (const pattern of patterns) {
      const match = dataStr.match(pattern);
      if (match?.[1]) {
        const value = match[1].replace(/[\x00-\x1f]/g, "").trim();
        if (value.length > 0 && value.length < 256) return value;
      }
    }
    return null;
  }
  private extractCertificate(filePath: string): string | undefined {
    try {
      const zip = new AdmZip(filePath);
      const entries = zip.getEntries();
      const certEntry = entries.find(
        (e) =>
          e.entryName.startsWith("META-INF/") &&
          (e.entryName.endsWith(".RSA") ||
            e.entryName.endsWith(".DSA") ||
            e.entryName.endsWith(".EC")),
      );
      if (!certEntry) return undefined;
      const certData = certEntry.getData();
      const hash = createHash("sha256").update(certData).digest("hex");
      return hash;
    } catch {
      return undefined;
    }
  }
  private detectArchitecture(filePath: string): string | undefined {
    try {
      const zip = new AdmZip(filePath);
      const entries = zip.getEntries();
      const archDirs = new Set<string>();
      for (const entry of entries) {
        if (entry.entryName.startsWith("lib/")) {
          const parts = entry.entryName.split("/");
          if (parts.length >= 3) {
            archDirs.add(parts[1]);
          }
        }
      }
      if (archDirs.has("arm64-v8a")) return "arm64-v8a";
      if (archDirs.has("armeabi-v7a")) return "armeabi-v7a";
      if (archDirs.has("x86_64")) return "x86_64";
      if (archDirs.has("x86")) return "x86";
      if (archDirs.size > 0) return Array.from(archDirs).join(",");
      return "universal";
    } catch {
      return undefined;
    }
  }
}
