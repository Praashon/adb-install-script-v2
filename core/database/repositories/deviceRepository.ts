import { eq } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { v4 as uuid } from 'uuid'
import * as schema from '../schema'
import { Device } from '../schema'

export class DeviceRepository {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  findAll(): Device[] {
    return this.db.select().from(schema.devices).all()
  }

  findById(id: string): Device | undefined {
    return this.db.select().from(schema.devices).where(eq(schema.devices.id, id)).get()
  }

  findBySerial(serial: string): Device | undefined {
    return this.db
      .select()
      .from(schema.devices)
      .where(eq(schema.devices.serial, serial))
      .get()
  }

  findPreferred(): Device | undefined {
    return this.db
      .select()
      .from(schema.devices)
      .where(eq(schema.devices.isPreferred, true))
      .get()
  }

  upsert(data: {
    serial: string
    model?: string
    manufacturer?: string
    androidVersion?: string
    architecture?: string
    status: 'online' | 'offline' | 'unauthorized'
  }): string {
    const existing = this.findBySerial(data.serial)
    const now = new Date()

    if (existing) {
      this.db
        .update(schema.devices)
        .set({
          model: data.model ?? existing.model,
          manufacturer: data.manufacturer ?? existing.manufacturer,
          androidVersion: data.androidVersion ?? existing.androidVersion,
          architecture: data.architecture ?? existing.architecture,
          status: data.status,
          lastSeen: now
        })
        .where(eq(schema.devices.id, existing.id))
        .run()
      return existing.id
    }

    const id = uuid()
    this.db.insert(schema.devices).values({
      id,
      serial: data.serial,
      model: data.model ?? null,
      manufacturer: data.manufacturer ?? null,
      androidVersion: data.androidVersion ?? null,
      architecture: data.architecture ?? null,
      status: data.status,
      isPreferred: false,
      lastSeen: now,
      createdAt: now
    }).run()

    return id
  }

  setPreferred(serial: string): void {
    this.db
      .update(schema.devices)
      .set({ isPreferred: false })
      .run()

    this.db
      .update(schema.devices)
      .set({ isPreferred: true })
      .where(eq(schema.devices.serial, serial))
      .run()
  }

  updateStatus(serial: string, status: Device['status']): void {
    this.db
      .update(schema.devices)
      .set({ status, lastSeen: new Date() })
      .where(eq(schema.devices.serial, serial))
      .run()
  }

  setAllOffline(): void {
    this.db
      .update(schema.devices)
      .set({ status: 'offline' })
      .run()
  }
}
