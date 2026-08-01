import { eq, desc, or } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { v4 as uuid } from 'uuid'
import * as schema from '../schema'
import { Job, NewJob } from '../schema'

export type JobStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'

export class JobRepository {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  findAll(): Job[] {
    return this.db.select().from(schema.jobs).orderBy(desc(schema.jobs.createdAt)).all()
  }

  findById(id: string): Job | undefined {
    return this.db.select().from(schema.jobs).where(eq(schema.jobs.id, id)).get()
  }

  findByStatus(status: JobStatus): Job[] {
    return this.db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.status, status))
      .orderBy(schema.jobs.createdAt)
      .all()
  }

  findRecoverable(): Job[] {
    return this.db
      .select()
      .from(schema.jobs)
      .where(or(eq(schema.jobs.status, 'queued'), eq(schema.jobs.status, 'running')))
      .orderBy(schema.jobs.createdAt)
      .all()
  }

  findRecent(limit: number = 20): Job[] {
    return this.db
      .select()
      .from(schema.jobs)
      .orderBy(desc(schema.jobs.createdAt))
      .limit(limit)
      .all()
  }

  findActive(): Job[] {
    return this.db
      .select()
      .from(schema.jobs)
      .where(
        or(
          eq(schema.jobs.status, 'queued'),
          eq(schema.jobs.status, 'running'),
          eq(schema.jobs.status, 'paused')
        )
      )
      .orderBy(schema.jobs.createdAt)
      .all()
  }

  create(data: {
    url: string
    type?: 'install' | 'download' | 'analyze'
    deviceId?: string
  }): string {
    const id = uuid()
    const now = new Date()

    this.db.insert(schema.jobs).values({
      id,
      type: data.type ?? 'install',
      url: data.url,
      status: 'queued',
      progress: 0,
      totalSteps: 7,
      deviceId: data.deviceId ?? null,
      createdAt: now,
      updatedAt: now
    } as NewJob).run()

    return id
  }

  updateStatus(id: string, status: JobStatus): void {
    this.db
      .update(schema.jobs)
      .set({ status, updatedAt: new Date() })
      .where(eq(schema.jobs.id, id))
      .run()
  }

  updateProgress(id: string, progress: number, currentStep: string): void {
    this.db
      .update(schema.jobs)
      .set({ progress, currentStep, updatedAt: new Date() })
      .where(eq(schema.jobs.id, id))
      .run()
  }

  setResult(id: string, result: Record<string, unknown>): void {
    this.db
      .update(schema.jobs)
      .set({
        result: JSON.stringify(result),
        status: 'completed',
        progress: 100,
        updatedAt: new Date()
      })
      .where(eq(schema.jobs.id, id))
      .run()
  }

  setError(id: string, error: string): void {
    this.db
      .update(schema.jobs)
      .set({
        error,
        status: 'failed',
        updatedAt: new Date()
      })
      .where(eq(schema.jobs.id, id))
      .run()
  }

  clearError(id: string): void {
    this.db
      .update(schema.jobs)
      .set({ error: null, result: null, progress: 0, updatedAt: new Date() })
      .where(eq(schema.jobs.id, id))
      .run()
  }

  saveContext(id: string, context: Record<string, unknown>): void {
    this.db
      .update(schema.jobs)
      .set({ context: JSON.stringify(context), updatedAt: new Date() })
      .where(eq(schema.jobs.id, id))
      .run()
  }

  readContext(id: string): Record<string, unknown> | undefined {
    const job = this.findById(id)
    if (!job?.context) return undefined
    try {
      return JSON.parse(job.context) as Record<string, unknown>
    } catch {
      return undefined
    }
  }

  setDeviceId(id: string, deviceId: string | null): void {
    this.db
      .update(schema.jobs)
      .set({ deviceId, updatedAt: new Date() })
      .where(eq(schema.jobs.id, id))
      .run()
  }

  setSourceId(id: string, sourceId: string): void {
    this.db
      .update(schema.jobs)
      .set({ sourceId, updatedAt: new Date() })
      .where(eq(schema.jobs.id, id))
      .run()
  }

  remove(id: string): void {
    this.db.delete(schema.jobs).where(eq(schema.jobs.id, id)).run()
  }

  countByStatus(status: JobStatus): number {
    const result = this.db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.status, status))
      .all()
    return result.length
  }
}
