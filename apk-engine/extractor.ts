import AdmZip from "adm-zip";
import { join } from "path";
import { mkdirSync, statSync } from "fs";
import { PackageType, ApkPackageInfo } from "./types";
export class Extractor {
  async extract(
    filePath: string,
    packageType: PackageType,
    outputDir: string,
  ): Promise<ApkPackageInfo> {
    mkdirSync(outputDir, { recursive: true });
    switch (packageType) {
      case "apk":
        return this.handleSingleApk(filePath, outputDir);
      case "xapk":
        return this.extractXapk(filePath, outputDir);
      case "apks":
        return this.extractApks(filePath, outputDir);
      case "split_bundle":
        return this.extractSplitBundle(filePath, outputDir);
    }
  }
  private handleSingleApk(
    filePath: string,
    _outputDir: string,
  ): ApkPackageInfo {
    return {
      type: "apk",
      filePath,
      fileSize: statSync(filePath).size,
      apkFiles: [filePath],
      obbFiles: [],
    };
  }
  private extractXapk(filePath: string, outputDir: string): ApkPackageInfo {
    const zip = new AdmZip(filePath);
    const entries = zip.getEntries();
    const apkFiles: string[] = [];
    const obbFiles: string[] = [];
    let manifestData: Record<string, unknown> | null = null;
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      if (entry.entryName === "manifest.json") {
        try {
          manifestData = JSON.parse(entry.getData().toString("utf-8"));
        } catch {}
        continue;
      }
      if (entry.entryName.endsWith(".apk")) {
        const flatName = entry.entryName.split("/").pop()!;
        zip.extractEntryTo(entry, outputDir, false, true);
        apkFiles.push(join(outputDir, flatName));
        continue;
      }
      if (
        entry.entryName.endsWith(".obb") ||
        entry.entryName.startsWith("Android/obb/")
      ) {
        const outPath = join(outputDir, entry.entryName);
        const dir = join(
          outputDir,
          entry.entryName.split("/").slice(0, -1).join("/"),
        );
        mkdirSync(dir, { recursive: true });
        zip.extractEntryTo(entry, outputDir, true, true);
        obbFiles.push(outPath);
        continue;
      }
    }
    this.sortApkFiles(apkFiles);
    return {
      type: "xapk",
      filePath,
      fileSize: statSync(filePath).size,
      packageName: manifestData?.package_name as string | undefined,
      versionName: manifestData?.version_name as string | undefined,
      versionCode: manifestData?.version_code as number | undefined,
      apkFiles,
      obbFiles,
    };
  }
  private extractApks(filePath: string, outputDir: string): ApkPackageInfo {
    const zip = new AdmZip(filePath);
    const entries = zip.getEntries();
    const apkFiles: string[] = [];
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      if (!entry.entryName.endsWith(".apk")) continue;
      zip.extractEntryTo(entry, outputDir, false, true);
      apkFiles.push(join(outputDir, entry.entryName.split("/").pop()!));
    }
    this.sortApkFiles(apkFiles);
    return {
      type: "apks",
      filePath,
      fileSize: statSync(filePath).size,
      apkFiles,
      obbFiles: [],
    };
  }
  private extractSplitBundle(
    filePath: string,
    outputDir: string,
  ): ApkPackageInfo {
    return this.extractApks(filePath, outputDir);
  }
  private sortApkFiles(files: string[]): void {
    files.sort((a, b) => {
      const aIsBase = a.toLowerCase().includes("base");
      const bIsBase = b.toLowerCase().includes("base");
      if (aIsBase && !bIsBase) return -1;
      if (!aIsBase && bIsBase) return 1;
      return a.localeCompare(b);
    });
  }
}
