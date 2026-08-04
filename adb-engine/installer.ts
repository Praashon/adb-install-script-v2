import { execFile } from "child_process";
import { promisify } from "util";
import { basename } from "path";
import { EventBus } from "@core/event-bus/eventBus";
const execFileAsync = promisify(execFile);
const ERROR_MESSAGES: Record<string, string> = {
  INSTALL_FAILED_ALREADY_EXISTS: "Application already exists on the device.",
  INSTALL_FAILED_INVALID_APK: "The APK file is invalid or corrupted.",
  INSTALL_FAILED_INSUFFICIENT_STORAGE:
    "Not enough storage space on the device.",
  INSTALL_FAILED_DUPLICATE_PACKAGE:
    "A package with the same name already exists.",
  INSTALL_FAILED_VERSION_DOWNGRADE:
    'A newer version is already installed. Enable "Allow downgrade" in Settings to replace it.',
  INSTALL_FAILED_UPDATE_INCOMPATIBLE:
    "Signed with a different certificate than the installed app. Uninstall the existing app first.",
  INSTALL_PARSE_FAILED_NO_CERTIFICATES:
    "Android rejected this package because it carries no signature. Android cannot install an unsigned APK, and this cannot be bypassed from the PC. The usual cause is a corrupted or incomplete download rather than a genuinely unsigned build.",
  INSTALL_PARSE_FAILED_INCONSISTENT_CERTIFICATES:
    "The package has inconsistent signatures across its files, which usually means it was repacked without being re-signed.",
  INSTALL_PARSE_FAILED_NOT_APK:
    "This file is not an Android package. The download most likely returned the wrong file.",
  INSTALL_FAILED_OLDER_SDK:
    "This APK requires a newer Android version than the device has.",
  INSTALL_FAILED_TEST_ONLY:
    "This is a test-only APK and cannot be installed normally.",
  INSTALL_FAILED_NO_MATCHING_ABIS:
    "The APK does not support this device's CPU architecture.",
  INSTALL_FAILED_USER_RESTRICTED:
    'The device blocked the install. Accept the prompt on your device or enable "Install via USB".',
  INSTALL_FAILED_MISSING_SPLIT:
    "Missing split APKs, install the full bundle instead.",
  INSTALL_FAILED_VERIFICATION_FAILURE:
    'Play Protect blocked the install. Disable "Verify apps over USB" on the device.',
};
const PERMANENT_CODES = new Set([
  "INSTALL_FAILED_ALREADY_EXISTS",
  "INSTALL_FAILED_INVALID_APK",
  "INSTALL_FAILED_INSUFFICIENT_STORAGE",
  "INSTALL_FAILED_DUPLICATE_PACKAGE",
  "INSTALL_FAILED_VERSION_DOWNGRADE",
  "INSTALL_FAILED_UPDATE_INCOMPATIBLE",
  "INSTALL_PARSE_FAILED_NO_CERTIFICATES",
  "INSTALL_PARSE_FAILED_INCONSISTENT_CERTIFICATES",
  "INSTALL_PARSE_FAILED_NOT_APK",
  "INSTALL_FAILED_OLDER_SDK",
  "INSTALL_FAILED_TEST_ONLY",
  "INSTALL_FAILED_NO_MATCHING_ABIS",
  "INSTALL_FAILED_USER_RESTRICTED",
  "INSTALL_FAILED_MISSING_SPLIT",
  "INSTALL_FAILED_VERIFICATION_FAILURE",
]);
export interface InstallResult {
  success: boolean;
  packageName?: string;
  error?: string;
  errorCode?: string;
  permanent?: boolean;
  output: string;
  duration: number;
}
export interface InstallOptions {
  serial?: string;
  signal?: AbortSignal;
  allowDowngrade?: boolean;
  grantPermissions?: boolean;
}
export class Installer {
  private adbPath: string;
  constructor(
    private eventBus: EventBus,
    adbPath?: string,
  ) {
    this.adbPath = adbPath?.trim() || "adb";
  }
  async installSingle(
    apkPath: string,
    options: InstallOptions = {},
  ): Promise<InstallResult> {
    const startTime = Date.now();
    const args = this.buildArgs(options, [
      "install",
      ...this.installFlags(options),
      apkPath,
    ]);
    this.eventBus.adb("info", `Installing ${basename(apkPath)}`, {
      serial: options.serial,
    });
    return this.runInstall(args, startTime, options);
  }
  async installMultiple(
    apkPaths: string[],
    options: InstallOptions = {},
  ): Promise<InstallResult> {
    if (apkPaths.length === 0) {
      return {
        success: false,
        error: "No APK files to install",
        output: "",
        duration: 0,
      };
    }
    if (apkPaths.length === 1) {
      return this.installSingle(apkPaths[0], options);
    }
    const startTime = Date.now();
    const args = this.buildArgs(options, [
      "install-multiple",
      ...this.installFlags(options),
      ...apkPaths,
    ]);
    this.eventBus.adb(
      "info",
      `Installing split bundle (${apkPaths.length} APKs)`,
      {
        serial: options.serial,
      },
    );
    return this.runInstall(args, startTime, options, 240000);
  }
  async pushObb(
    obbPath: string,
    packageName: string,
    options: InstallOptions = {},
  ): Promise<boolean> {
    const remoteDir = `/sdcard/Android/obb/${packageName}`;
    this.eventBus.adb("info", `Pushing OBB to ${remoteDir}`, {
      serial: options.serial,
    });
    try {
      await execFileAsync(
        this.adbPath,
        this.buildArgs(options, ["shell", "mkdir", "-p", remoteDir]),
        { timeout: 15000, signal: options.signal, windowsHide: true },
      );
      await execFileAsync(
        this.adbPath,
        this.buildArgs(options, ["push", obbPath, `${remoteDir}/`]),
        {
          timeout: 600000,
          signal: options.signal,
          windowsHide: true,
          maxBuffer: 1024 * 1024 * 16,
        },
      );
      this.eventBus.adb("info", `OBB pushed: ${basename(obbPath)}`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.eventBus.adb("error", `OBB push failed: ${message}`);
      return false;
    }
  }
  private async runInstall(
    args: string[],
    startTime: number,
    options: InstallOptions,
    timeout = 180000,
  ): Promise<InstallResult> {
    try {
      const { stdout, stderr } = await execFileAsync(this.adbPath, args, {
        timeout,
        signal: options.signal,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 8,
      });
      const output = `${stdout}${stderr}`;
      const duration = Date.now() - startTime;
      if (!/success/i.test(output)) {
        const { error, errorCode, permanent } = this.classifyFailure(output);
        this.eventBus.adb("error", `Installation failed: ${error}`, { output });
        return { success: false, error, errorCode, permanent, output, duration };
      }
      this.eventBus.adb("info", "Installed successfully", { duration });
      return { success: true, output, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      const err = error as NodeJS.ErrnoException & {
        stdout?: string;
        stderr?: string;
      };
      const output = `${err.stdout ?? ""}${err.stderr ?? ""}`;
      if (err.code === "ENOENT") {
        return {
          success: false,
          error: `ADB executable not found at "${this.adbPath}". Check the ADB path in Settings.`,
          permanent: true,
          output,
          duration,
        };
      }
      if (output.trim()) {
        const { error, errorCode, permanent } = this.classifyFailure(output);
        return { success: false, error, errorCode, permanent, output, duration };
      }
      return {
        success: false,
        error: err.message || "Unknown error",
        output,
        duration,
      };
    }
  }
  private installFlags(options: InstallOptions): string[] {
    const flags = ["-r"];
    if (options.allowDowngrade) flags.push("-d");
    if (options.grantPermissions) flags.push("-g");
    return flags;
  }
  private buildArgs(options: InstallOptions, args: string[]): string[] {
    return options.serial ? ["-s", options.serial, ...args] : args;
  }
  private classifyFailure(output: string): {
    error: string;
    errorCode?: string;
    permanent: boolean;
  } {
    const code = Object.keys(ERROR_MESSAGES).find((c) => output.includes(c));
    if (code) {
      return {
        error: ERROR_MESSAGES[code],
        errorCode: code,
        permanent: PERMANENT_CODES.has(code),
      };
    }
    const parseFailure = output.match(/INSTALL_PARSE_FAILED_[A-Z_]+/);
    if (parseFailure) {
      return {
        error: `The package could not be parsed by Android (${parseFailure[0]}). The file is most likely corrupted or incomplete.`,
        errorCode: parseFailure[0],
        permanent: true,
      };
    }
    return { error: this.parseInstallError(output), permanent: false };
  }
  private parseInstallError(output: string): string {
    for (const [code, message] of Object.entries(ERROR_MESSAGES)) {
      if (output.includes(code)) return message;
    }
    if (/device unauthorized/i.test(output)) {
      return "Device is unauthorized. Accept the USB debugging prompt on your device.";
    }
    if (/no devices\/emulators found/i.test(output)) {
      return "No device connected.";
    }
    if (/device .* not found/i.test(output)) {
      return "The selected device is no longer connected.";
    }
    const failureMatch = output.match(/Failure \[([^\]]+)\]/);
    if (failureMatch) return failureMatch[1];
    const errorLine = output
      .split("\n")
      .map((l) => l.trim())
      .find((l) => /^(error|adb:)/i.test(l));
    if (errorLine) return errorLine;
    return "Installation failed with an unknown error";
  }
}
