import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
const execFileAsync = promisify(execFile);
export interface AdbDevice {
  serial: string;
  status: "online" | "offline" | "unauthorized";
  model: string;
  manufacturer: string;
  androidVersion: string;
  architecture: string;
  sdkVersion?: string;
  batteryLevel?: number;
  storageFree?: string;
  isEmulator?: boolean;
}
export interface InstalledPackage {
  packageName: string;
  versionName?: string;
  isSystem: boolean;
}
export function describePackageFailure(output: string): string {
  const thrown = output
    .match(/^[\w.$]+(?:Exception|Error):\s*(.+)$/m)?.[1]
    ?.trim();
  if (thrown && /no root permission/i.test(thrown)) {
    return "This package is locked by the manufacturer and can only be changed with root. ADB cannot do it — and neither can Shizuku-based tools such as Canta, because they run with the same shell permissions.";
  }
  if (/DELETE_FAILED_INTERNAL_ERROR/i.test(output)) {
    return "Android refused to remove this app. It is part of the system image.";
  }
  if (/DELETE_FAILED_USER_RESTRICTED/i.test(output)) {
    return "The manufacturer software refuses to remove this app. vivo, Xiaomi, and Oppo builds hard-block uninstalling core system apps even over ADB. Non-core preinstalled apps can usually still be removed.";
  }
  if (/DELETE_FAILED_DEVICE_POLICY_MANAGER/i.test(output)) {
    return "A device administrator policy is protecting this app.";
  }
  if (/DELETE_FAILED_OWNER_BLOCKED/i.test(output)) {
    return "The device owner has blocked removing this app.";
  }
  if (/Unknown package|not installed for/i.test(output)) {
    return "That package is not installed on this device.";
  }
  if (/device unauthorized/i.test(output)) {
    return "Device is unauthorized. Accept the USB debugging prompt on the device.";
  }
  const failure = output.match(/Failure \[([^\]]+)\]/);
  if (failure) return failure[1];
  if (thrown) return thrown;
  const firstUsefulLine = output
    .split("\n")
    .map((line) => line.trim())
    .find(
      (line) =>
        line.length > 0 &&
        !/^Exception occurred/i.test(line) &&
        !/^at [\w.$]/.test(line),
    );
  return firstUsefulLine || "The command failed";
}
export interface UninstallResult {
  success: boolean;
  mode: "full" | "user" | "disabled";
  output: string;
  error?: string;
}
export class AdbManager {
  private adbPath: string;
  constructor(adbPath?: string) {
    const configured = adbPath?.trim();
    const isExplicit =
      Boolean(configured) && configured !== "adb" && configured !== "adb.exe";
    this.adbPath = isExplicit ? (configured as string) : AdbManager.findAdb();
  }
  getAdbPath(): string {
    return this.adbPath;
  }
  async isAvailable(): Promise<boolean> {
    try {
      await this.exec(["version"]);
      return true;
    } catch {
      return false;
    }
  }
  async getVersion(): Promise<string | null> {
    try {
      const { stdout } = await this.exec(["version"]);
      return stdout.split("\n")[0]?.trim() || null;
    } catch {
      return null;
    }
  }
  async listDevices(): Promise<AdbDevice[]> {
    const { stdout } = await this.exec(["devices", "-l"]);
    const lines = stdout.trim().split("\n").slice(1);
    const devices: AdbDevice[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("*")) continue;
      const parts = trimmed.split(/\s+/);
      if (parts.length < 2) continue;
      const serial = parts[0];
      const rawStatus = parts[1];
      const status =
        rawStatus === "device"
          ? "online"
          : rawStatus === "unauthorized"
            ? "unauthorized"
            : "offline";
      let model = "";
      let product = "";
      for (const part of parts.slice(2)) {
        if (part.startsWith("model:"))
          model = part.replace("model:", "").replace(/_/g, " ");
        if (part.startsWith("product:")) product = part.replace("product:", "");
      }
      let manufacturer = "";
      let androidVersion = "";
      let architecture = "";
      let sdkVersion: string | undefined;
      if (status === "online") {
        try {
          const info = await this.getDeviceProperties(serial);
          manufacturer = info.manufacturer;
          androidVersion = info.androidVersion;
          architecture = info.architecture;
          sdkVersion = info.sdkVersion;
          if (!model) model = info.model;
        } catch {}
      }
      devices.push({
        serial,
        status,
        model: model || product || serial,
        manufacturer,
        androidVersion,
        architecture,
        sdkVersion,
        isEmulator: serial.startsWith("emulator-"),
      });
    }
    return devices;
  }
  async getDeviceInfo(serial: string): Promise<AdbDevice> {
    const props = await this.getDeviceProperties(serial);
    const [batteryLevel, storageFree] = await Promise.all([
      this.getBatteryLevel(serial),
      this.getFreeStorage(serial),
    ]);
    return {
      serial,
      status: "online",
      isEmulator: serial.startsWith("emulator-"),
      batteryLevel,
      storageFree,
      ...props,
    };
  }
  async listPackages(
    serial: string,
    includeSystem = false,
  ): Promise<InstalledPackage[]> {
    const args = ["-s", serial, "shell", "pm", "list", "packages"];
    if (!includeSystem) args.push("-3");
    const { stdout } = await this.exec(args, 60000);
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("package:"))
      .map((line) => ({
        packageName: line.replace("package:", "").trim(),
        isSystem: includeSystem,
      }))
      .filter((pkg) => pkg.packageName.length > 0)
      .sort((a, b) => a.packageName.localeCompare(b.packageName));
  }
  async getPackagePaths(
    packageName: string,
    serial: string,
  ): Promise<string[]> {
    const { stdout } = await this.exec(
      ["-s", serial, "shell", "pm", "path", packageName],
      30000,
    );
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("package:"))
      .map((line) => line.replace("package:", "").trim())
      .filter((path) => path.length > 0);
  }
  async pullFile(
    devicePath: string,
    localPath: string,
    serial: string,
  ): Promise<void> {
    await execFileAsync(
      this.adbPath,
      ["-s", serial, "pull", devicePath, localPath],
      { timeout: 300000, windowsHide: true, maxBuffer: 1024 * 1024 * 16 },
    );
  }
  async uninstall(
    packageName: string,
    serial: string,
  ): Promise<UninstallResult> {
    return this.runUninstall(["-s", serial, "uninstall", packageName], "full");
  }
  async uninstallForUser(
    packageName: string,
    serial: string,
  ): Promise<UninstallResult> {
    return this.runUninstall(
      ["-s", serial, "shell", "pm", "uninstall", "--user", "0", packageName],
      "user",
    );
  }
  async disableForUser(
    packageName: string,
    serial: string,
  ): Promise<UninstallResult> {
    return this.runStateChange(
      ["-s", serial, "shell", "pm", "disable-user", "--user", "0", packageName],
      /new state:\s*disabled/i,
    );
  }
  async enableForUser(
    packageName: string,
    serial: string,
  ): Promise<UninstallResult> {
    return this.runStateChange(
      ["-s", serial, "shell", "pm", "enable", "--user", "0", packageName],
      /new state:\s*enabled/i,
    );
  }
  private async runStateChange(
    args: string[],
    successPattern: RegExp,
  ): Promise<UninstallResult> {
    try {
      const { stdout, stderr } = await execFileAsync(this.adbPath, args, {
        timeout: 60000,
        windowsHide: true,
      });
      const output = `${stdout}${stderr}`.trim();
      const success = successPattern.test(output);
      return {
        success,
        mode: "disabled",
        output,
        error: success ? undefined : this.parseUninstallError(output),
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException & {
        stdout?: string;
        stderr?: string;
      };
      const output = `${err.stdout ?? ""}${err.stderr ?? ""}`.trim();
      return {
        success: false,
        mode: "disabled",
        output,
        error: this.parseUninstallError(output || err.message || ""),
      };
    }
  }
  private async runUninstall(
    args: string[],
    mode: "full" | "user",
  ): Promise<UninstallResult> {
    try {
      const { stdout, stderr } = await execFileAsync(this.adbPath, args, {
        timeout: 60000,
        windowsHide: true,
      });
      const output = `${stdout}${stderr}`.trim();
      const success = /^success/im.test(output);
      return {
        success,
        mode,
        output,
        error: success ? undefined : this.parseUninstallError(output),
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException & {
        stdout?: string;
        stderr?: string;
      };
      const output = `${err.stdout ?? ""}${err.stderr ?? ""}`.trim();
      return {
        success: false,
        mode,
        output,
        error:
          err.code === "ENOENT"
            ? `ADB executable not found at "${this.adbPath}".`
            : this.parseUninstallError(output || err.message || ""),
      };
    }
  }
  private parseUninstallError(output: string): string {
    return describePackageFailure(output);
  }
  async connect(address: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const { stdout, stderr } = await this.exec(["connect", address], 20000);
      const output = `${stdout}${stderr}`.trim();
      return { success: /connected to/i.test(output), message: output };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
  async disconnect(address: string): Promise<void> {
    await this.exec(["disconnect", address], 20000).catch(() => undefined);
  }
  async startServer(): Promise<void> {
    await this.exec(["start-server"], 20000).catch(() => undefined);
  }
  private async getBatteryLevel(serial: string): Promise<number | undefined> {
    try {
      const { stdout } = await this.exec([
        "-s",
        serial,
        "shell",
        "dumpsys",
        "battery",
      ]);
      const match = stdout.match(/level:\s*(\d+)/);
      return match ? parseInt(match[1], 10) : undefined;
    } catch {
      return undefined;
    }
  }
  private async getFreeStorage(serial: string): Promise<string | undefined> {
    try {
      const { stdout } = await this.exec([
        "-s",
        serial,
        "shell",
        "df",
        "-h",
        "/data",
      ]);
      const dataLine = stdout.split("\n").find((l) => l.includes("/data"));
      if (!dataLine) return undefined;
      const columns = dataLine.trim().split(/\s+/);
      return columns[3];
    } catch {
      return undefined;
    }
  }
  private async getDeviceProperties(serial: string): Promise<{
    model: string;
    manufacturer: string;
    androidVersion: string;
    architecture: string;
    sdkVersion: string;
  }> {
    const getProp = async (prop: string): Promise<string> => {
      try {
        const { stdout } = await this.exec([
          "-s",
          serial,
          "shell",
          "getprop",
          prop,
        ]);
        return stdout.trim();
      } catch {
        return "";
      }
    };
    const [model, manufacturer, androidVersion, architecture, sdkVersion] =
      await Promise.all([
        getProp("ro.product.model"),
        getProp("ro.product.manufacturer"),
        getProp("ro.build.version.release"),
        getProp("ro.product.cpu.abi"),
        getProp("ro.build.version.sdk"),
      ]);
    return { model, manufacturer, androidVersion, architecture, sdkVersion };
  }
  private async exec(
    args: string[],
    timeout = 30000,
  ): Promise<{
    stdout: string;
    stderr: string;
  }> {
    try {
      return await execFileAsync(this.adbPath, args, {
        timeout,
        windowsHide: true,
      });
    } catch (error) {
      throw new Error(this.describeExecError(error));
    }
  }
  private describeExecError(error: unknown): string {
    const err = error as NodeJS.ErrnoException & {
      stderr?: string;
    };
    if (err?.code === "ENOENT") {
      return `ADB executable not found at "${this.adbPath}". Set a custom ADB path in Settings or install Android platform-tools.`;
    }
    if (err?.stderr) {
      return err.stderr.trim();
    }
    return err?.message || "ADB command failed";
  }
  static findAdb(): string {
    const exe = process.platform === "win32" ? "adb.exe" : "adb";
    const localAppData = process.env.LOCALAPPDATA;
    const androidHome =
      process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
    const candidates = [
      process.env.ADB_PATH,
      androidHome ? join(androidHome, "platform-tools", exe) : undefined,
      localAppData
        ? join(localAppData, "Android", "Sdk", "platform-tools", exe)
        : undefined,
      join(
        homedir(),
        "AppData",
        "Local",
        "Android",
        "Sdk",
        "platform-tools",
        exe,
      ),
      join(homedir(), "Android", "Sdk", "platform-tools", exe),
      join(homedir(), "Library", "Android", "sdk", "platform-tools", exe),
      "C:\\platform-tools\\adb.exe",
      "C:\\Android\\platform-tools\\adb.exe",
      "/usr/local/bin/adb",
      "/usr/bin/adb",
    ].filter((c): c is string => Boolean(c));
    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate;
    }
    return "adb";
  }
}
