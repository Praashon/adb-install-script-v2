import { execFile } from "child_process";
import { promisify } from "util";
const execFileAsync = promisify(execFile);
export interface VerificationResult {
  installed: boolean;
  packageName: string;
  versionName?: string;
  versionCode?: number;
  error?: string;
}
export class Verifier {
  private adbPath: string;
  constructor(adbPath?: string) {
    this.adbPath = adbPath?.trim() || "adb";
  }
  async verifyInstallation(
    packageName: string,
    serial?: string,
  ): Promise<VerificationResult> {
    try {
      const args = serial
        ? ["-s", serial, "shell", "pm", "list", "packages", packageName]
        : ["shell", "pm", "list", "packages", packageName];
      const { stdout } = await execFileAsync(this.adbPath, args, {
        timeout: 15000,
        windowsHide: true,
      });
      const installed = stdout
        .split("\n")
        .map((line) => line.trim().replace("package:", ""))
        .includes(packageName);
      if (!installed) {
        return {
          installed: false,
          packageName,
          error: "Package not found on the device after install",
        };
      }
      const { versionName, versionCode } = await this.getInstalledVersion(
        packageName,
        serial,
      );
      return { installed: true, packageName, versionName, versionCode };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { installed: false, packageName, error: message };
    }
  }
  async getInstalledVersion(
    packageName: string,
    serial?: string,
  ): Promise<{
    versionName?: string;
    versionCode?: number;
  }> {
    try {
      const args = serial
        ? ["-s", serial, "shell", "dumpsys", "package", packageName]
        : ["shell", "dumpsys", "package", packageName];
      const { stdout } = await execFileAsync(this.adbPath, args, {
        timeout: 15000,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 8,
      });
      const versionName = stdout.match(/versionName=([^\s]+)/)?.[1];
      const rawCode = stdout.match(/versionCode=(\d+)/)?.[1];
      return {
        versionName,
        versionCode: rawCode ? parseInt(rawCode, 10) : undefined,
      };
    } catch {
      return {};
    }
  }
  async launchApp(packageName: string, serial?: string): Promise<boolean> {
    try {
      const args = serial
        ? [
            "-s",
            serial,
            "shell",
            "monkey",
            "-p",
            packageName,
            "-c",
            "android.intent.category.LAUNCHER",
            "1",
          ]
        : [
            "shell",
            "monkey",
            "-p",
            packageName,
            "-c",
            "android.intent.category.LAUNCHER",
            "1",
          ];
      await execFileAsync(this.adbPath, args, { timeout: 10000 });
      return true;
    } catch {
      return false;
    }
  }
}
