import { extractManifestInfo } from "../manifest/axml";
import { inspectSignature } from "../signature";
import { validateEntries } from "../../scripts/safe-archive.cjs";
import { dirname } from "path";
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
    const signature = await inspectSignature(filePath);
    const certificate = signature.status === "verified" ? signature.certificateSha256.join(",") : undefined;
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
      validateEntries(zip.getEntries(), dirname(filePath));
      if (manifestEntry.header.size > 8 * 1024 ** 2) throw new Error("Manifest exceeds limit");
      const info = extractManifestInfo(manifestEntry.getData());
      return { packageName: info.packageName ?? "unknown", versionName: info.versionName ?? undefined, versionCode: info.versionCode ?? undefined };
    } catch {
      return { packageName: "unknown" };
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
