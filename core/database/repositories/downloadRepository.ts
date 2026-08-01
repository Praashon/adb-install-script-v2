import { eq, desc } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { v4 as uuid } from 'uuid'
import * as schema from '../schema'
import { Download } from '../schema'

export class DownloadRepository {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  findAll(): Download[] {
    return this.db.select().from(schema.downloads).orderBy(desc(schema.downloads.createdAt)).all()
  }

  findById(id: string): Download | undefined {
    return this.db.select().from(schema.downloads).where(eq(schema.downloads.id, id)).get()
  }

  findByJobId(jobId: string): Download | undefined {
    return this.db
      .select()
      .from(schema.downloads)
      .where(eq(schema.downloads.jobId, jobId))
      .get()
  }

  findBySha256(sha256: string): Download | undefined {
    return this.db
      .select()
      .from(schema.downloads)
      .where(eq(schema.downloads.sha256, sha256))
      .get()
  }

  create(data: {
    jobId?: string
    sourceId?: string
    url: string
    filename: string
    filePath?: string
    fileSize?: number
    packageType?: 'apk' | 'xapk' | 'apks' | 'split_bundle'
  }): string {
    const id = uuid()

    this.db.insert(schema.downloads).values({
      id,
      jobId: data.jobId ?? null,
      sourceId: data.sourceId ?? null,
      url: data.url,
      filename: data.filename,
      filePath: data.filePath ?? null,
      fileSize: data.fileSize ?? null,
      packageType: data.packageType ?? null,
      status: 'downloading',
      createdAt: new Date()
    }).run()

    return id
  }

  updateFile(
    id: string,
    data: {
      filePath: string
      fileSize: number
      sha256?: string
      mimeType?: string
      packageName?: string
      versionName?: string
    }
  ): void {
    this.db
      .update(schema.downloads)
      .set({
        filePath: data.filePath,
        fileSize: data.fileSize,
        sha256: data.sha256 ?? null,
        mimeType: data.mimeType ?? null,
        packageName: data.packageName ?? null,
        versionName: data.versionName ?? null,
        status: 'completed'
      })
      .where(eq(schema.downloads.id, id))
      .run()
  }

  setFailed(id: string): void {
    this.db
      .update(schema.downloads)
      .set({ status: 'failed' })
      .where(eq(schema.downloads.id, id))
      .run()
  }

  remove(id: string): void {
    this.db.delete(schema.downloads).where(eq(schema.downloads.id, id)).run()
  }
}
