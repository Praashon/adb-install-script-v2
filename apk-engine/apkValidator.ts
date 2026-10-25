import { validateEntries } from "../scripts/safe-archive.cjs";
import { dirname } from "path";
import AdmZip from "adm-zip";
import { statSync } from "fs";
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  hasManifest: boolean;
  hasDex: boolean;
  hasResources: boolean;
  entryCount: number;
  fileSize: number;
}
const MIN_APK_SIZE = 1024;
const MAX_APK_SIZE = 4 * 1024 * 1024 * 1024;
export class ApkValidator {
  validate(filePath: string): ValidationResult {
    const errors: string[] = [];
    let hasManifest = false;
    let hasDex = false;
    let hasResources = false;
    let entryCount = 0;
    const stat = statSync(filePath);
    const fileSize = stat.size;
    if (fileSize < MIN_APK_SIZE) {
      errors.push(`File too small: ${fileSize} bytes`);
    }
    if (fileSize > MAX_APK_SIZE) {
      errors.push(`File too large: ${fileSize} bytes`);
    }
    try {
      const zip = new AdmZip(filePath);
      const entries = validateEntries(zip.getEntries(), dirname(filePath));
      entryCount = entries.length;
      if (entryCount === 0) {
        errors.push("APK archive is empty");
      }
      for (const entry of entries) {
        if (entry.entryName === "AndroidManifest.xml") {
          hasManifest = true;
        }
        if (
          entry.entryName === "classes.dex" ||
          entry.entryName.match(/^classes\d*\.dex$/)
        ) {
          hasDex = true;
        }
        if (entry.entryName === "resources.arsc") {
          hasResources = true;
        }
      }
      if (!hasManifest) {
        errors.push("Missing AndroidManifest.xml");
      }
      if (!hasDex) {
        errors.push("Missing classes.dex");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      errors.push(`Failed to read APK archive: ${message}`);
    }
    return {
      valid: errors.length === 0,
      errors,
      hasManifest,
      hasDex,
      hasResources,
      entryCount,
      fileSize,
    };
  }
  isValidArchive(filePath: string): boolean {
    try {
      const zip = new AdmZip(filePath);
      validateEntries(zip.getEntries(), dirname(filePath));
      return true;
    } catch {
      return false;
    }
  }
}
