import { eq, and, desc } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { v4 as uuid } from 'uuid'
import * as schema from '../schema'
import { InstalledApp } from '../schema'

export class InstalledAppRepository {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  findAll(): InstalledApp[] {
    return this.db
      .select()
      .from(schema.installedApps)
      .orderBy(desc(schema.installedApps.installedAt))
      .all()
  }

  findByDeviceId(deviceId: string): InstalledApp[] {
    return this.db
      .select()
      .from(schema.installedApps)
      .where(eq(schema.installedApps.deviceId, deviceId))
      .orderBy(desc(schema.installedApps.installedAt))
      .all()
  }

  findByPackage(packageName: string, deviceId?: string): InstalledApp | undefined {
    const condition = deviceId
      ? and(
          eq(schema.installedApps.packageName, packageName),
          eq(schema.installedApps.deviceId, deviceId)
        )
      : eq(schema.installedApps.packageName, packageName)

    return this.db
      .select()
      .from(schema.installedApps)
      .where(condition)
      .orderBy(desc(schema.installedApps.installedAt))
      .get()
  }

  /** One row per package per device — a reinstall updates the existing record. */
  record(data: {
    packageName: string
    versionName?: string
    versionCode?: number
    sha256?: string
    certificate?: string
    architecture?: string
    deviceId?: string
    sourceId?: string
    downloadId?: string
  }): string {
    const existing = data.deviceId
      ? this.findByPackage(data.packageName, data.deviceId)
      : undefined

    if (existing) {
      this.db
        .update(schema.installedApps)
        .set({
          versionName: data.versionName ?? existing.versionName,
          versionCode: data.versionCode ?? existing.versionCode,
          sha256: data.sha256 ?? existing.sha256,
          certificate: data.certificate ?? existing.certificate,
          architecture: data.architecture ?? existing.architecture,
          sourceId: data.sourceId ?? existing.sourceId,
          downloadId: data.downloadId ?? existing.downloadId,
          installedAt: new Date()
        })
        .where(eq(schema.installedApps.id, existing.id))
        .run()
      return existing.id
    }

    const id = uuid()
    this.db
      .insert(schema.installedApps)
      .values({
        id,
        packageName: data.packageName,
        versionName: data.versionName ?? null,
        versionCode: data.versionCode ?? null,
        sha256: data.sha256 ?? null,
        certificate: data.certificate ?? null,
        architecture: data.architecture ?? null,
        deviceId: data.deviceId ?? null,
        sourceId: data.sourceId ?? null,
        downloadId: data.downloadId ?? null,
        installedAt: new Date()
      })
      .run()

    return id
  }

  remove(id: string): void {
    this.db.delete(schema.installedApps).where(eq(schema.installedApps.id, id)).run()
  }

  removeByPackage(packageName: string, deviceId: string): void {
    this.db
      .delete(schema.installedApps)
      .where(
        and(
          eq(schema.installedApps.packageName, packageName),
          eq(schema.installedApps.deviceId, deviceId)
        )
      )
      .run()
  }
}
