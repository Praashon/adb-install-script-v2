import { eq, and, desc } from "drizzle-orm";
import { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { v4 as uuid } from "uuid";
import * as schema from "../schema";
import { AdapterVersion } from "../schema";
export class AdapterRepository {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}
  findBySourceId(sourceId: string): AdapterVersion[] {
    return this.db
      .select()
      .from(schema.adapterVersions)
      .where(eq(schema.adapterVersions.sourceId, sourceId))
      .orderBy(desc(schema.adapterVersions.version))
      .all();
  }
  findActiveBySourceId(sourceId: string): AdapterVersion | undefined {
    return this.db
      .select()
      .from(schema.adapterVersions)
      .where(
        and(
          eq(schema.adapterVersions.sourceId, sourceId),
          eq(schema.adapterVersions.isActive, true),
        ),
      )
      .orderBy(desc(schema.adapterVersions.version))
      .get();
  }
  findById(id: string): AdapterVersion | undefined {
    return this.db
      .select()
      .from(schema.adapterVersions)
      .where(eq(schema.adapterVersions.id, id))
      .get();
  }
  create(data: {
    sourceId: string;
    version: number;
    rules: Record<string, unknown>;
    downloadStrategy?: "direct" | "html" | "browser" | "redirect";
  }): string {
    const id = uuid();
    this.db
      .insert(schema.adapterVersions)
      .values({
        id,
        sourceId: data.sourceId,
        version: data.version,
        rules: JSON.stringify(data.rules),
        downloadStrategy: data.downloadStrategy ?? "html",
        successRate: 100,
        totalAttempts: 0,
        failureCount: 0,
        isActive: true,
        createdAt: new Date(),
      })
      .run();
    return id;
  }
  recordSuccess(id: string): void {
    const adapter = this.findById(id);
    if (!adapter) return;
    const totalAttempts = adapter.totalAttempts + 1;
    const successRate =
      ((totalAttempts - adapter.failureCount) / totalAttempts) * 100;
    this.db
      .update(schema.adapterVersions)
      .set({
        totalAttempts,
        successRate,
        lastTested: new Date(),
      })
      .where(eq(schema.adapterVersions.id, id))
      .run();
  }
  recordFailure(id: string): void {
    const adapter = this.findById(id);
    if (!adapter) return;
    const totalAttempts = adapter.totalAttempts + 1;
    const failureCount = adapter.failureCount + 1;
    const successRate = ((totalAttempts - failureCount) / totalAttempts) * 100;
    this.db
      .update(schema.adapterVersions)
      .set({
        totalAttempts,
        failureCount,
        successRate,
        lastTested: new Date(),
      })
      .where(eq(schema.adapterVersions.id, id))
      .run();
  }
  deactivate(id: string): void {
    this.db
      .update(schema.adapterVersions)
      .set({ isActive: false })
      .where(eq(schema.adapterVersions.id, id))
      .run();
  }
  getNextVersion(sourceId: string): number {
    const latest = this.db
      .select()
      .from(schema.adapterVersions)
      .where(eq(schema.adapterVersions.sourceId, sourceId))
      .orderBy(desc(schema.adapterVersions.version))
      .get();
    return (latest?.version ?? 0) + 1;
  }
}
