import { eq } from "drizzle-orm";
import { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { v4 as uuid } from "uuid";
import * as schema from "../schema";
import { Source } from "../schema";
export class SourceRepository {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}
  findAll(): Source[] {
    return this.db.select().from(schema.sources).all();
  }
  findById(id: string): Source | undefined {
    return this.db
      .select()
      .from(schema.sources)
      .where(eq(schema.sources.id, id))
      .get();
  }
  findByDomain(domain: string): Source | undefined {
    return this.db
      .select()
      .from(schema.sources)
      .where(eq(schema.sources.domain, domain))
      .get();
  }
  findActive(): Source[] {
    return this.db
      .select()
      .from(schema.sources)
      .where(eq(schema.sources.status, "healthy"))
      .all();
  }
  create(data: {
    domain: string;
    name: string;
    url: string;
    pluginPath?: string;
    isBuiltIn?: boolean;
  }): string {
    const id = uuid();
    const now = new Date();
    this.db
      .insert(schema.sources)
      .values({
        id,
        domain: data.domain,
        name: data.name,
        url: data.url,
        status: "healthy",
        pluginPath: data.pluginPath ?? null,
        isBuiltIn: data.isBuiltIn ?? false,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }
  update(
    id: string,
    data: Partial<{
      name: string;
      url: string;
      status: "healthy" | "degraded" | "broken" | "disabled";
      pluginPath: string;
    }>,
  ): void {
    this.db
      .update(schema.sources)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.sources.id, id))
      .run();
  }
  remove(id: string): void {
    this.db.delete(schema.sources).where(eq(schema.sources.id, id)).run();
  }
  updateStatus(id: string, status: Source["status"]): void {
    this.db
      .update(schema.sources)
      .set({ status, updatedAt: new Date() })
      .where(eq(schema.sources.id, id))
      .run();
  }
}
