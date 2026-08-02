import { execFile, spawn, ChildProcess } from "child_process";
import { promisify } from "util";
import { writeFile } from "fs/promises";

const execFileAsync = promisify(execFile);

interface ActiveRecording {
  child: ChildProcess;
  remotePath: string;
}

const recordings = new Map<string, ActiveRecording>();

export async function captureScreenshot(
  adbPath: string,
  serial: string,
  localPath: string,
): Promise<void> {
  const { stdout } = await execFileAsync(
    adbPath,
    ["-s", serial, "exec-out", "screencap", "-p"],
    {
      encoding: "buffer",
      maxBuffer: 1024 * 1024 * 96,
      windowsHide: true,
      timeout: 30000,
    },
  );

  const bytes = stdout as unknown as Buffer;
  if (bytes.length === 0) {
    throw new Error("The device returned an empty screenshot.");
  }
  await writeFile(localPath, bytes);
}

export function isRecording(serial: string): boolean {
  return recordings.has(serial);
}

export function startRecording(adbPath: string, serial: string): string {
  if (recordings.has(serial)) {
    throw new Error("A recording is already in progress for this device.");
  }

  const remotePath = `/sdcard/adb-bench-${Date.now()}.mp4`;
  const child = spawn(
    adbPath,
    ["-s", serial, "shell", "screenrecord", "--time-limit", "179", remotePath],
    { windowsHide: true },
  );

  child.on("error", () => {
    recordings.delete(serial);
  });

  recordings.set(serial, { child, remotePath });
  return remotePath;
}

export async function stopRecording(
  adbPath: string,
  serial: string,
  localPath: string,
): Promise<void> {
  const active = recordings.get(serial);
  if (!active) {
    throw new Error("No recording is in progress for this device.");
  }
  recordings.delete(serial);

  await execFileAsync(
    adbPath,
    ["-s", serial, "shell", "pkill", "-INT", "screenrecord"],
    { windowsHide: true, timeout: 10000 },
  ).catch(() => undefined);

  await waitForExit(active.child, 4000);
  await delay(900);

  await execFileAsync(
    adbPath,
    ["-s", serial, "pull", active.remotePath, localPath],
    { timeout: 120000, windowsHide: true, maxBuffer: 1024 * 1024 * 16 },
  );

  await execFileAsync(
    adbPath,
    ["-s", serial, "shell", "rm", "-f", active.remotePath],
    { windowsHide: true, timeout: 10000 },
  ).catch(() => undefined);
}

export function cancelAllRecordings(): void {
  for (const [, active] of recordings) {
    active.child.kill();
  }
  recordings.clear();
}

function waitForExit(child: ChildProcess, timeout: number): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.killed) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      child.kill();
      resolve();
    }, timeout);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
