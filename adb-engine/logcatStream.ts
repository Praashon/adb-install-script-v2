import { assertSerial } from "./arguments";
import { spawn, ChildProcess } from "child_process";

export type LogLevel = "V" | "D" | "I" | "W" | "E" | "F";

export interface LogLine {
  id: number;
  ts: string;
  pid: string;
  level: LogLevel;
  tag: string;
  message: string;
}

type Broadcast = (serial: string, lines: LogLine[]) => void;

const THREADTIME =
  /^(\d\d-\d\d \d\d:\d\d:\d\d\.\d+)\s+(\d+)\s+\d+\s+([VDIWEF])\s+([^:]*?):\s?(.*)$/;

const FLUSH_INTERVAL_MS = 150;

interface Session {
  child: ChildProcess;
  buffer: LogLine[];
  timer: NodeJS.Timeout;
  carry: string;
}

export class LogcatManager {
  private sessions = new Map<string, Session>();
  private nextId = 1;

  constructor(
    private getAdbPath: () => string,
    private broadcast: Broadcast,
  ) {}

  isRunning(serial: string): boolean {
    return this.sessions.has(serial);
  }

  start(serial: string): void {
  assertSerial(serial);
    if (this.sessions.has(serial)) return;

    const child = spawn(
      this.getAdbPath(),
      ["-s", serial, "logcat", "-v", "threadtime"],
      { windowsHide: true },
    );

    const session: Session = {
      child,
      buffer: [],
      carry: "",
      timer: setInterval(() => this.flush(serial), FLUSH_INTERVAL_MS),
    };
    this.sessions.set(serial, session);

    child.stdout?.on("data", (chunk: Buffer) =>
      this.ingest(serial, chunk.toString("utf-8")),
    );
    child.stderr?.on("data", (chunk: Buffer) =>
      this.ingest(serial, chunk.toString("utf-8")),
    );
    child.on("error", () => this.stop(serial));
    child.on("exit", () => this.stop(serial));
  }

  stop(serial: string): void {
    const session = this.sessions.get(serial);
    if (!session) return;
    this.sessions.delete(serial);
    clearInterval(session.timer);
    session.child.kill();
    if (session.buffer.length > 0) this.broadcast(serial, session.buffer);
  }

  stopAll(): void {
    for (const serial of [...this.sessions.keys()]) this.stop(serial);
  }

  async clear(serial: string): Promise<void> {
  assertSerial(serial);
    await new Promise<void>((resolve) => {
      const child = spawn(this.getAdbPath(), ["-s", serial, "logcat", "-c"], {
        windowsHide: true,
      });
      child.on("exit", () => resolve());
      child.on("error", () => resolve());
    });
  }

  private ingest(serial: string, text: string): void {
    const session = this.sessions.get(serial);
    if (!session) return;

    const combined = session.carry + text;
    const lines = combined.split("\n");
    session.carry = (lines.pop() ?? "").slice(-65536);

    for (const raw of lines) {
      const line = raw.replace(/\r$/, "");
      if (!line.trim()) continue;
      session.buffer.push(this.parse(line));
    }

    if (session.buffer.length > 500) this.flush(serial);
  }

  private flush(serial: string): void {
    const session = this.sessions.get(serial);
    if (!session || session.buffer.length === 0) return;
    const batch = session.buffer;
    session.buffer = [];
    this.broadcast(serial, batch);
  }

  private parse(line: string): LogLine {
    const match = line.match(THREADTIME);
    if (match) {
      return {
        id: this.nextId++,
        ts: match[1],
        pid: match[2],
        level: match[3] as LogLevel,
        tag: match[4].trim(),
        message: match[5],
      };
    }
    return {
      id: this.nextId++,
      ts: "",
      pid: "",
      level: "I",
      tag: "",
      message: line,
    };
  }
}
