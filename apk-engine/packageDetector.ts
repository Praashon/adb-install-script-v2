import AdmZip from "adm-zip";
import { PackageType } from "./types";
export class PackageDetector {
  detect(filePath: string): PackageType {
    const extension = this.getExtension(filePath);
    if (extension === ".xapk") return "xapk";
    if (extension === ".apks") return "apks";
    if (extension === ".apk") {
      if (this.isZipBundle(filePath)) return "split_bundle";
      return "apk";
    }
    if (extension === ".zip") {
      if (this.containsApkFiles(filePath)) return "split_bundle";
    }
    if (this.isValidApk(filePath)) return "apk";
    if (this.containsApkFiles(filePath)) return "split_bundle";
    return "apk";
  }
  private getExtension(filePath: string): string {
    const lower = filePath.toLowerCase();
    if (lower.endsWith(".xapk")) return ".xapk";
    if (lower.endsWith(".apks")) return ".apks";
    if (lower.endsWith(".apk")) return ".apk";
    if (lower.endsWith(".zip")) return ".zip";
    return "";
  }
  private isValidApk(filePath: string): boolean {
    try {
      const zip = new AdmZip(filePath);
      const entries = zip.getEntries();
      return entries.some((e) => e.entryName === "AndroidManifest.xml");
    } catch {
      return false;
    }
  }
  private isZipBundle(filePath: string): boolean {
    try {
      const zip = new AdmZip(filePath);
      const entries = zip.getEntries();
      const hasManifest = entries.some(
        (e) => e.entryName === "AndroidManifest.xml",
      );
      if (hasManifest) return false;
      return entries.some((e) => e.entryName.endsWith(".apk"));
    } catch {
      return false;
    }
  }
  private containsApkFiles(filePath: string): boolean {
    try {
      const zip = new AdmZip(filePath);
      const entries = zip.getEntries();
      return entries.some((e) => e.entryName.endsWith(".apk"));
    } catch {
      return false;
    }
  }
}
