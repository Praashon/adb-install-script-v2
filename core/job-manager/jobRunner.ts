import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '@core/database/schema'
import { JobRepository } from '@core/database/repositories/jobRepository'
import { EventBus } from '@core/event-bus/eventBus'
import { JobQueue } from './jobQueue'
import { RetryManager } from './retryManager'
import {
  JobContext,
  StepName,
  createJobSteps,
  INSTALL_STEPS
} from './jobTypes'

type StepExecutor = (context: JobContext) => Promise<JobContext>

export class JobRunner {
  private jobRepo: JobRepository
  private jobQueue: JobQueue
  private retryManager: RetryManager
  private isProcessing = false
  private cancelledJobs = new Set<string>()
  private pausedJobs = new Set<string>()
  private stepExecutors = new Map<StepName, StepExecutor>()
  private maxConcurrent = 2

  constructor(
    private db: BetterSQLite3Database<typeof schema>,
    private eventBus: EventBus
  ) {
    this.jobRepo = new JobRepository(db)
    this.jobQueue = new JobQueue(db, eventBus)
    this.retryManager = new RetryManager()
  }

  registerStep(name: StepName, executor: StepExecutor): void {
    this.stepExecutors.set(name, executor)
  }

  async processNext(): Promise<void> {
    if (this.isProcessing) return
    if (this.jobQueue.getActiveCount() >= this.maxConcurrent) return

    const next = this.jobQueue.getNext()
    if (!next) return

    this.isProcessing = true

    try {
      await this.executeJob(next.jobId, next.context)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this.jobRepo.setError(next.jobId, message)
      this.eventBus.job(next.jobId, 'error', `Job failed: ${message}`)
    } finally {
      this.isProcessing = false
      this.processNext()
    }
  }

  private async executeJob(jobId: string, context: JobContext): Promise<void> {
    const job = this.jobRepo.findById(jobId)
    if (!job) return

    this.jobRepo.updateStatus(jobId, 'running')
    this.eventBus.job(jobId, 'info', 'Job started')

    const steps = createJobSteps(job.type as 'install' | 'download' | 'analyze')
    let currentContext = { ...context }

    for (let i = 0; i < steps.length; i++) {
      if (this.cancelledJobs.has(jobId)) {
        this.jobRepo.updateStatus(jobId, 'cancelled')
        this.cancelledJobs.delete(jobId)
        this.eventBus.job(jobId, 'info', 'Job cancelled')
        return
      }

      if (this.pausedJobs.has(jobId)) {
        this.jobRepo.updateStatus(jobId, 'paused')
        this.jobRepo.updateProgress(
          jobId,
          (i / steps.length) * 100,
          steps[i].name
        )
        this.eventBus.job(jobId, 'info', 'Job paused')
        return
      }

      const step = steps[i]
      const progress = (i / steps.length) * 100

      this.jobRepo.updateProgress(jobId, progress, step.name)
      this.eventBus.job(jobId, 'info', `Step: ${step.label}`, {
        step: step.name,
        stepIndex: i,
        totalSteps: steps.length,
        progress
      })

      const executor = this.stepExecutors.get(step.name)
      if (!executor) {
        this.eventBus.job(jobId, 'warn', `No executor for step: ${step.name}, skipping`)
        continue
      }

      const retryKey = `${jobId}:${step.name}`
      let stepCompleted = false

      while (!stepCompleted) {
        try {
          currentContext = await executor(currentContext)
          stepCompleted = true
          this.retryManager.reset(retryKey)

          this.eventBus.job(jobId, 'info', `Completed: ${step.label}`, {
            step: step.name,
            stepIndex: i
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error'

          if (this.retryManager.shouldRetry(retryKey)) {
            const attempt = this.retryManager.recordAttempt(retryKey)
            const remaining = this.retryManager.getRemainingRetries(retryKey)

            this.eventBus.job(jobId, 'warn', `Step "${step.label}" failed, retrying (${attempt}/${attempt + remaining})`, {
              step: step.name,
              error: message,
              attempt
            })

            await this.retryManager.waitForRetry(retryKey)
          } else {
            this.retryManager.reset(retryKey)
            this.jobRepo.setError(jobId, `Step "${step.label}" failed after retries: ${message}`)
            this.eventBus.job(jobId, 'error', `Step "${step.label}" failed: ${message}`, {
              step: step.name,
              error: message
            })
            return
          }
        }
      }
    }

    this.jobRepo.setResult(jobId, {
      ...currentContext,
      completedAt: Date.now()
    })
    this.eventBus.job(jobId, 'info', 'Job completed successfully', { progress: 100 })
  }

  async cancelJob(jobId: string): Promise<void> {
    this.cancelledJobs.add(jobId)
    const job = this.jobRepo.findById(jobId)
    if (job?.status === 'queued') {
      this.jobRepo.updateStatus(jobId, 'cancelled')
    }
  }

  async pauseJob(jobId: string): Promise<void> {
    this.pausedJobs.add(jobId)
  }

  async resumeJob(jobId: string): Promise<void> {
    this.pausedJobs.delete(jobId)
    const job = this.jobRepo.findById(jobId)
    if (job?.status === 'paused') {
      this.jobRepo.updateStatus(jobId, 'queued')
      this.processNext()
    }
  }

  async recoverPendingJobs(): Promise<void> {
    const recoverable = this.jobRepo.findRecoverable()

    for (const job of recoverable) {
      this.jobRepo.updateStatus(job.id, 'queued')
      this.eventBus.job(job.id, 'info', 'Job recovered after restart')
    }

    if (recoverable.length > 0) {
      this.eventBus.log('job-manager', 'info', `Recovered ${recoverable.length} pending jobs`)
      this.processNext()
    }
  }

  setMaxConcurrent(max: number): void {
    this.maxConcurrent = Math.max(1, max)
  }
}
