import { createWriteStream } from "fs";
import { mkdir, unlink } from "fs/promises";
import { dirname } from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { EventBus } from "@core/event-bus/eventBus";
export interface DownloadOptions {
  url: string;
  outputPath: string;
  headers?: Record<string, string>;
  jobId?: string;
  signal?: AbortSignal;
  onProgress?: (
    downloaded: number,
    total: number | null,
    speed: number,
  ) => void;
}
export interface DownloadResult {
  filePath: string;
  fileSize: number;
  mimeType?: string;
  duration: number;
}
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
export class Downloader {
  constructor(private eventBus: EventBus) {}
  async download(options: DownloadOptions): Promise<DownloadResult> {
    const { url, outputPath, headers = {}, jobId, signal } = options;
    await mkdir(dirname(outputPath), { recursive: true });
    const startTime = Date.now();
    this.eventBus.download("info", `Starting download: ${url}`, { jobId });
    const response = await fetch(url, {
      headers: { "User-Agent": DEFAULT_USER_AGENT, ...headers },
      redirect: "follow",
      signal,
    });
    if (!response.ok) {
      throw new Error(
        `Download failed: HTTP ${response.status} ${response.statusText}`,
      );
    }
    if (!response.body) {
      throw new Error("Server returned an empty response body");
    }
    const contentLength = response.headers.get("content-length");
    const totalSize = contentLength ? parseInt(contentLength, 10) : null;
    const mimeType = response.headers.get("content-type") || undefined;
    let downloaded = 0;
    let lastTick = startTime;
    let lastBytes = 0;
    const source = Readable.fromWeb(
      response.body as Parameters<typeof Readable.fromWeb>[0],
    );
    source.on("data", (chunk: Buffer) => {
      downloaded += chunk.length;
      const now = Date.now();
      const elapsed = now - lastTick;
      if (elapsed < 400) return;
      const speed = ((downloaded - lastBytes) / elapsed) * 1000;
      lastTick = now;
      lastBytes = downloaded;
      options.onProgress?.(downloaded, totalSize, speed);
      this.eventBus.download("debug", "Download progress", {
        downloaded,
        total: totalSize,
        progress: totalSize ? Math.round((downloaded / totalSize) * 100) : -1,
        speed: Math.round(speed),
        jobId,
      });
    });
    try {
      await pipeline(source, createWriteStream(outputPath), { signal });
    } catch (error) {
      await unlink(outputPath).catch(() => {});
      if (signal?.aborted) throw new Error("Download aborted");
      throw error;
    }
    if (totalSize !== null && downloaded < totalSize) {
      await unlink(outputPath).catch(() => {});
      throw new Error(
        `Download incomplete: received ${downloaded} of ${totalSize} bytes`,
      );
    }
    const duration = Date.now() - startTime;
    options.onProgress?.(downloaded, totalSize, 0);
    this.eventBus.download("info", "Download complete", {
      filePath: outputPath,
      fileSize: downloaded,
      duration,
      jobId,
    });
    return { filePath: outputPath, fileSize: downloaded, mimeType, duration };
  }
}
