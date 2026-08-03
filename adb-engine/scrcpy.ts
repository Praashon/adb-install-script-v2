import { spawn, ChildProcess } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

export interface ScrcpyOptions {
  bundledDir: string;
  getAdbPath: () => string;
  getOverride: () => string | undefined;
}

export interface ScrcpyStatus {
  available: boolean;
  path: string | null;
  bundled: boolean;
}

export class ScrcpyManager {
  private processes = new Map<string, ChildProcess>();

  constructor(private opts: ScrcpyOptions) {}

  isRunning(serial: string): boolean {
    return this.processes.has(serial);
  }

  status(): ScrcpyStatus {
    const override = this.opts.getOverride();
    if (override && existsSync(override)) {
      return { available: true, path: override, bundled: false };
    }

    const bundled = this.bundledExecutable();
    if (bundled) return { available: true, path: bundled, bundled: true };

    const onPath = this.pathExecutable();
    return {
      available: Boolean(onPath),
      path: onPath,
      bundled: false,
    };
  }

  start(serial: string): void {
    if (this.processes.has(serial)) return;

    const status = this.status();
    if (!status.available || !status.path) {
      throw new Error(
        "scrcpy was not found. Bundle it under resources/scrcpy, install it and add it to PATH, or set a custom path in Settings.",
      );
    }

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ADB: this.opts.getAdbPath(),
    };
    if (status.bundled) {
      env.SCRCPY_SERVER_PATH = join(this.opts.bundledDir, "scrcpy-server");
    }

    const child = spawn(
      status.path,
      ["--serial", serial, "--window-title", `ADB Bench - ${serial}`],
      { env, windowsHide: false, detached: false },
    );

    child.on("error", () => this.processes.delete(serial));
    child.on("exit", () => this.processes.delete(serial));
    this.processes.set(serial, child);
  }

  stop(serial: string): void {
    const child = this.processes.get(serial);
    if (!child) return;
    this.processes.delete(serial);
    child.kill();
  }

  stopAll(): void {
    for (const serial of [...this.processes.keys()]) this.stop(serial);
  }

  private bundledExecutable(): string | null {
    const exe = process.platform === "win32" ? "scrcpy.exe" : "scrcpy";
    const candidate = join(this.opts.bundledDir, exe);
    return existsSync(candidate) ? candidate : null;
  }

  private pathExecutable(): string | null {
    if (process.platform !== "win32") {
      for (const candidate of ["/usr/local/bin/scrcpy", "/usr/bin/scrcpy"]) {
        if (existsSync(candidate)) return candidate;
      }
      return "scrcpy";
    }

    const localAppData = process.env.LOCALAPPDATA;
    const candidates = [
      localAppData
        ? join(localAppData, "Microsoft", "WinGet", "Links", "scrcpy.exe")
        : undefined,
      "C:\\scrcpy\\scrcpy.exe",
      "C:\\Program Files\\scrcpy\\scrcpy.exe",
    ].filter((c): c is string => Boolean(c));

    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate;
    }
    return null;
  }
}
