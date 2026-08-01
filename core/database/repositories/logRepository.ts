import { eq, desc, lt } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../schema'
import { Log } from '../schema'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export class LogRepository {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  findRecent(limit: number = 200): Log[] {
    return this.db
      .select()
      .from(schema.logs)
      .orderBy(desc(schema.logs.id))
      .limit(limit)
      .all()
  }

  findByJobId(jobId: string): Log[] {
    return this.db
      .select()
      .from(schema.logs)
      .where(eq(schema.logs.jobId, jobId))
      .orderBy(schema.logs.id)
      .all()
  }

  create(data: {
    level: LogLevel
    source: string
    message: string
    metadata?: Record<string, unknown>
    jobId?: string
  }): void {
    this.db
      .insert(schema.logs)
      .values({
        level: data.level,
        source: data.source,
        message: data.message,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        jobId: data.jobId ?? null,
        createdAt: new Date()
      })
      .run()
  }

  clear(): void {
    this.db.delete(schema.logs).run()
  }

  /** Keeps the log table from growing without bound across long-running installs. */
  pruneOlderThan(days: number): void {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    this.db.delete(schema.logs).where(lt(schema.logs.createdAt, cutoff)).run()
  }
}
