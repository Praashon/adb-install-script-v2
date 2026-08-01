import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '@core/database/schema'
import { JobRepository } from '@core/database/repositories/jobRepository'
import { EventBus } from '@core/event-bus/eventBus'
import { JobContext, createJobSteps } from './jobTypes'

export class JobQueue {
  private jobRepo: JobRepository

  constructor(
    private db: BetterSQLite3Database<typeof schema>,
    private eventBus: EventBus
  ) {
    this.jobRepo = new JobRepository(db)
  }

  async enqueue(url: string, deviceId?: string): Promise<string> {
    const jobId = this.jobRepo.create({
      url,
      type: 'install',
      deviceId
    })

    const steps = createJobSteps('install')

    this.jobRepo.updateProgress(jobId, 0, steps[0].name)

    this.eventBus.job(jobId, 'info', 'Job queued', {
      url,
      deviceId,
      steps: steps.map((s) => s.name)
    })

    return jobId
  }

  async enqueueDownload(url: string): Promise<string> {
    const jobId = this.jobRepo.create({
      url,
      type: 'download'
    })

    const steps = createJobSteps('download')
    this.jobRepo.updateProgress(jobId, 0, steps[0].name)

    this.eventBus.job(jobId, 'info', 'Download job queued', { url })
    return jobId
  }

  async enqueueAnalysis(url: string): Promise<string> {
    const jobId = this.jobRepo.create({
      url,
      type: 'analyze'
    })

    this.jobRepo.updateProgress(jobId, 0, 'detect_source')
    this.eventBus.job(jobId, 'info', 'Analysis job queued', { url })
    return jobId
  }

  getNext(): { jobId: string; context: JobContext } | null {
    const queued = this.jobRepo.findByStatus('queued')
    if (queued.length === 0) return null

    const job = queued[0]
    return {
      jobId: job.id,
      context: {
        jobId: job.id,
        url: job.url,
        deviceId: job.deviceId ?? undefined,
        sourceId: job.sourceId ?? undefined
      }
    }
  }

  async requeueFailed(jobId: string): Promise<void> {
    this.jobRepo.updateStatus(jobId, 'queued')
    this.jobRepo.updateProgress(jobId, 0, 'detect_source')
    this.eventBus.job(jobId, 'info', 'Job requeued for retry')
  }

  getActiveCount(): number {
    return this.jobRepo.countByStatus('running')
  }
}
