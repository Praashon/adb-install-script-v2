import { eq } from 'drizzle-orm'
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../schema'

export class SettingsRepository {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  get(key: string): string | undefined {
    const row = this.db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, key))
      .get()
    return row?.value
  }

  getTyped<T>(key: string, fallback: T): T {
    const raw = this.get(key)
    if (raw === undefined) return fallback

    try {
      return JSON.parse(raw) as T
    } catch {
      return raw as unknown as T
    }
  }

  set(key: string, value: string): void {
    const existing = this.get(key)
    const now = new Date()

    if (existing !== undefined) {
      this.db
        .update(schema.settings)
        .set({ value, updatedAt: now })
        .where(eq(schema.settings.key, key))
        .run()
    } else {
      this.db.insert(schema.settings).values({
        key,
        value,
        updatedAt: now
      }).run()
    }
  }

  getAll(): Record<string, string> {
    const rows = this.db.select().from(schema.settings).all()
    const result: Record<string, string> = {}
    for (const row of rows) {
      result[row.key] = row.value
    }
    return result
  }

  remove(key: string): void {
    this.db.delete(schema.settings).where(eq(schema.settings.key, key)).run()
  }
}
