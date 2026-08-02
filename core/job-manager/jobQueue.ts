import { existsSync } from "fs";
import { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@core/database/schema";
import { JobRepository } from "@core/database/repositories/jobRepository";
import { DeviceRepository } from "@core/database/repositories/deviceRepository";
import { EventBus } from "@core/event-bus/eventBus";
import { JobContext, JobType, createJobSteps } from "./jobTypes";
export class JobQueue {
  private jobRepo: JobRepository;
  private deviceRepo: DeviceRepository;
  constructor(
    db: BetterSQLite3Database<typeof schema>,
    private eventBus: EventBus,
  ) {
    this.jobRepo = new JobRepository(db);
    this.deviceRepo = new DeviceRepository(db);
  }
  async enqueue(url: string, deviceSerial?: string): Promise<string> {
    return this.createJob(url, "install", deviceSerial);
  }
  async enqueueDownload(url: string): Promise<string> {
    return this.createJob(url, "download");
  }
  async enqueueAnalysis(url: string): Promise<string> {
    return this.createJob(url, "analyze");
  }
  private createJob(url: string, type: JobType, deviceSerial?: string): string {
    const trimmed = url.trim();
    if (!trimmed) {
      throw new Error("A URL is required");
    }
    if (!/^https?:\/\//i.test(trimmed)) {
      throw new Error("URL must start with http:// or https://");
    }
    const device = deviceSerial
      ? this.deviceRepo.findBySerial(deviceSerial)
      : undefined;
    const preferred =
      device ??
      (type === "install" ? this.deviceRepo.findPreferred() : undefined);
    const jobId = this.jobRepo.create({
      url: trimmed,
      type,
      deviceId: preferred?.id,
    });
    const steps = createJobSteps(type);
    this.jobRepo.updateProgress(jobId, 0, steps[0].name);
    this.jobRepo.saveContext(jobId, {
      jobId,
      url: trimmed,
      deviceId: preferred?.id,
      deviceSerial: preferred?.serial,
    });
    this.eventBus.job(jobId, "info", `${this.labelFor(type)} queued`, {
      url: trimmed,
      deviceSerial: preferred?.serial,
      steps: steps.map((s) => s.name),
    });
    return jobId;
  }
  getNext(excludeIds: Set<string> = new Set()): {
    jobId: string;
    context: JobContext;
  } | null {
    const queued = this.jobRepo.findByStatus("queued");
    const job = queued.find((j) => !excludeIds.has(j.id));
    if (!job) return null;
    const saved = this.jobRepo.readContext(job.id) ?? {};
    return {
      jobId: job.id,
      context: {
        ...saved,
        jobId: job.id,
        url: job.url,
        deviceId: job.deviceId ?? undefined,
        sourceId: job.sourceId ?? undefined,
      } as JobContext,
    };
  }
  async requeueFailed(jobId: string): Promise<void> {
    const job = this.jobRepo.findById(jobId);
    if (!job) throw new Error("Job not found");
    const steps = createJobSteps(job.type as JobType);
    const saved = this.jobRepo.readContext(jobId) ?? {};
    const downloadPath =
      typeof saved.downloadPath === "string" ? saved.downloadPath : undefined;
    const hasLocalFile = Boolean(downloadPath && existsSync(downloadPath));
    this.jobRepo.clearError(jobId);
    this.jobRepo.updateStatus(jobId, "queued");
    this.jobRepo.updateProgress(
      jobId,
      0,
      hasLocalFile ? "validate_package" : steps[0].name,
    );
    this.jobRepo.saveContext(
      jobId,
      hasLocalFile
        ? { ...saved, jobId, url: job.url, deviceId: job.deviceId ?? undefined }
        : { jobId, url: job.url, deviceId: job.deviceId ?? undefined },
    );
    this.eventBus.job(
      jobId,
      "info",
      hasLocalFile
        ? "Job requeued, reusing the downloaded file"
        : "Job requeued for retry",
    );
  }
  getActiveCount(): number {
    return this.jobRepo.countByStatus("running");
  }
  private labelFor(type: JobType): string {
    if (type === "download") return "Download";
    if (type === "analyze") return "Analysis";
    return "Install";
  }
}
