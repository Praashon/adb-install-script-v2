import { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@core/database/schema";
import { JobRepository } from "@core/database/repositories/jobRepository";
import { EventBus } from "@core/event-bus/eventBus";
import { JobQueue } from "./jobQueue";
import { RetryManager } from "./retryManager";
import {
  JobContext,
  JobType,
  StepName,
  StepExecutor,
  StepHelpers,
  createJobSteps,
} from "./jobTypes";
class JobAbortedError extends Error {
  constructor(readonly kind: "cancelled" | "paused") {
    super(kind === "cancelled" ? "Job cancelled" : "Job paused");
    this.name = "JobAbortedError";
  }
}
interface RunningJob {
  controller: AbortController;
  kind: "cancelled" | "paused" | null;
}
export class JobRunner {
  private jobRepo: JobRepository;
  private jobQueue: JobQueue;
  private retryManager: RetryManager;
  private running = new Map<string, RunningJob>();
  private stepExecutors = new Map<StepName, StepExecutor>();
  private maxConcurrent = 2;
  private draining = false;
  constructor(
    db: BetterSQLite3Database<typeof schema>,
    private eventBus: EventBus,
  ) {
    this.jobRepo = new JobRepository(db);
    this.jobQueue = new JobQueue(db, eventBus);
    this.retryManager = new RetryManager();
  }
  registerStep(name: StepName, executor: StepExecutor): void {
    this.stepExecutors.set(name, executor);
  }
  processNext(): void {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.running.size < this.maxConcurrent) {
        const next = this.jobQueue.getNext(new Set(this.running.keys()));
        if (!next) break;
        const entry: RunningJob = {
          controller: new AbortController(),
          kind: null,
        };
        this.running.set(next.jobId, entry);
        void this.executeJob(next.jobId, next.context, entry)
          .catch((error) => {
            const message =
              error instanceof Error ? error.message : "Unknown error";
            this.jobRepo.setError(next.jobId, message);
            this.eventBus.job(next.jobId, "error", `Job failed: ${message}`);
          })
          .finally(() => {
            this.running.delete(next.jobId);
            this.processNext();
          });
      }
    } finally {
      this.draining = false;
    }
  }
  private async executeJob(
    jobId: string,
    context: JobContext,
    entry: RunningJob,
  ): Promise<void> {
    const job = this.jobRepo.findById(jobId);
    if (!job) return;
    const steps = createJobSteps(job.type as JobType);
    const resumeIndex = Math.max(
      0,
      steps.findIndex((s) => s.name === job.currentStep),
    );
    this.jobRepo.updateStatus(jobId, "running");
    this.eventBus.job(
      jobId,
      "info",
      resumeIndex > 0 ? "Job resumed" : "Job started",
      {
        progress: (resumeIndex / steps.length) * 100,
      },
    );
    let currentContext = { ...context };
    try {
      for (let i = resumeIndex; i < steps.length; i++) {
        const step = steps[i];
        const stepStart = (i / steps.length) * 100;
        const stepSpan = 100 / steps.length;
        this.throwIfAborted(entry);
        this.jobRepo.updateProgress(jobId, stepStart, step.name);
        this.eventBus.job(jobId, "info", `Step: ${step.label}`, {
          step: step.name,
          stepIndex: i,
          totalSteps: steps.length,
          progress: stepStart,
        });
        const executor = this.stepExecutors.get(step.name);
        if (!executor) {
          this.eventBus.job(
            jobId,
            "warn",
            `No executor for step: ${step.name}, skipping`,
          );
          continue;
        }
        const helpers: StepHelpers = {
          setStepProgress: (fraction) => {
            const clamped = Math.max(0, Math.min(1, fraction));
            const progress = stepStart + clamped * stepSpan;
            this.jobRepo.updateProgress(jobId, progress, step.name);
            this.eventBus.job(jobId, "debug", step.label, {
              step: step.name,
              stepIndex: i,
              totalSteps: steps.length,
              progress,
            });
          },
          log: (level, message, data) => {
            this.eventBus.job(jobId, level, message, {
              step: step.name,
              ...data,
            });
          },
          signal: entry.controller.signal,
          throwIfAborted: () => this.throwIfAborted(entry),
        };
        currentContext = await this.runStepWithRetries(
          jobId,
          step.name,
          step.label,
          executor,
          currentContext,
          helpers,
          entry,
        );
        this.jobRepo.saveContext(
          jobId,
          currentContext as unknown as Record<string, unknown>,
        );
        this.eventBus.job(jobId, "info", `Completed: ${step.label}`, {
          step: step.name,
          stepIndex: i,
          progress: stepStart + stepSpan,
        });
      }
    } catch (error) {
      if (error instanceof JobAbortedError) {
        this.jobRepo.saveContext(
          jobId,
          currentContext as unknown as Record<string, unknown>,
        );
        this.jobRepo.updateStatus(jobId, error.kind);
        this.eventBus.job(jobId, "info", error.message);
        return;
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      this.jobRepo.saveContext(
        jobId,
        currentContext as unknown as Record<string, unknown>,
      );
      this.jobRepo.setError(jobId, message);
      this.eventBus.job(jobId, "error", message);
      return;
    }
    this.jobRepo.saveContext(
      jobId,
      currentContext as unknown as Record<string, unknown>,
    );
    this.jobRepo.setResult(jobId, {
      ...currentContext,
      completedAt: Date.now(),
    });
    this.eventBus.job(jobId, "info", "Job completed successfully", {
      progress: 100,
    });
  }
  private async runStepWithRetries(
    jobId: string,
    stepName: StepName,
    stepLabel: string,
    executor: StepExecutor,
    context: JobContext,
    helpers: StepHelpers,
    entry: RunningJob,
  ): Promise<JobContext> {
    const retryKey = `${jobId}:${stepName}`;
    for (;;) {
      try {
        const result = await executor(context, helpers);
        this.retryManager.reset(retryKey);
        return result;
      } catch (error) {
        this.throwIfAborted(entry);
        if (error instanceof JobAbortedError) throw error;
        const message =
          error instanceof Error ? error.message : "Unknown error";
        if (error instanceof Error && error.name === "NonRetryableError") {
          this.retryManager.reset(retryKey);
          throw new Error(message);
        }
        if (!this.retryManager.shouldRetry(retryKey)) {
          this.retryManager.reset(retryKey);
          throw new Error(`${stepLabel} failed: ${message}`);
        }
        const attempt = this.retryManager.recordAttempt(retryKey);
        const remaining = this.retryManager.getRemainingRetries(retryKey);
        this.eventBus.job(
          jobId,
          "warn",
          `${stepLabel} failed, retrying (${attempt}/${attempt + remaining}): ${message}`,
          { step: stepName, error: message, attempt },
        );
        await this.retryManager.waitForRetry(retryKey);
        this.throwIfAborted(entry);
      }
    }
  }
  private throwIfAborted(entry: RunningJob): void {
    if (entry.kind) throw new JobAbortedError(entry.kind);
  }
  async cancelJob(jobId: string): Promise<void> {
    const entry = this.running.get(jobId);
    if (entry) {
      entry.kind = "cancelled";
      entry.controller.abort();
      return;
    }
    const job = this.jobRepo.findById(jobId);
    if (job && ["queued", "paused"].includes(job.status)) {
      this.jobRepo.updateStatus(jobId, "cancelled");
      this.eventBus.job(jobId, "info", "Job cancelled");
    }
  }
  async pauseJob(jobId: string): Promise<void> {
    const entry = this.running.get(jobId);
    if (entry) {
      entry.kind = "paused";
      entry.controller.abort();
      return;
    }
    const job = this.jobRepo.findById(jobId);
    if (job?.status === "queued") {
      this.jobRepo.updateStatus(jobId, "paused");
      this.eventBus.job(jobId, "info", "Job paused");
    }
  }
  async resumeJob(jobId: string): Promise<void> {
    const job = this.jobRepo.findById(jobId);
    if (job?.status !== "paused") return;
    this.jobRepo.updateStatus(jobId, "queued");
    this.eventBus.job(jobId, "info", "Job resumed");
    this.processNext();
  }
  async recoverPendingJobs(): Promise<void> {
    const recoverable = this.jobRepo.findRecoverable();
    for (const job of recoverable) {
      if (job.status === "running") {
        this.jobRepo.updateStatus(job.id, "queued");
        this.eventBus.job(job.id, "info", "Job recovered after restart");
      }
    }
    if (recoverable.length > 0) {
      this.eventBus.log(
        "job-manager",
        "info",
        `Recovered ${recoverable.length} pending job(s)`,
      );
    }
    this.processNext();
  }
  isRunning(jobId: string): boolean {
    return this.running.has(jobId);
  }
  setMaxConcurrent(max: number): void {
    this.maxConcurrent = Math.max(1, Math.min(8, max));
    this.processNext();
  }
}
