import { eq, desc } from "drizzle-orm";
import { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { v4 as uuid } from "uuid";
import * as schema from "../schema";
import { WirelessDevice } from "../schema";

export class WirelessDeviceRepository {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  findAll(): WirelessDevice[] {
    return this.db
      .select()
      .from(schema.wirelessDevices)
      .orderBy(desc(schema.wirelessDevices.lastConnectedAt))
      .all();
  }

  findByAddress(address: string): WirelessDevice | undefined {
    return this.db
      .select()
      .from(schema.wirelessDevices)
      .where(eq(schema.wirelessDevices.address, address))
      .get();
  }

  findAutoConnect(): WirelessDevice[] {
    return this.findAll().filter((d) => d.autoConnect);
  }

  save(data: {
    address: string;
    label: string;
    autoConnect?: boolean;
  }): string {
    const existing = this.findByAddress(data.address);
    if (existing) {
      this.db
        .update(schema.wirelessDevices)
        .set({
          label: data.label || existing.label,
          autoConnect: data.autoConnect ?? existing.autoConnect,
        })
        .where(eq(schema.wirelessDevices.id, existing.id))
        .run();
      return existing.id;
    }

    const id = uuid();
    this.db
      .insert(schema.wirelessDevices)
      .values({
        id,
        address: data.address,
        label: data.label,
        autoConnect: data.autoConnect ?? true,
        lastConnectedAt: null,
        createdAt: new Date(),
      })
      .run();
    return id;
  }

  setAutoConnect(id: string, autoConnect: boolean): void {
    this.db
      .update(schema.wirelessDevices)
      .set({ autoConnect })
      .where(eq(schema.wirelessDevices.id, id))
      .run();
  }

  markConnected(address: string): void {
    this.db
      .update(schema.wirelessDevices)
      .set({ lastConnectedAt: new Date() })
      .where(eq(schema.wirelessDevices.address, address))
      .run();
  }

  remove(id: string): void {
    this.db
      .delete(schema.wirelessDevices)
      .where(eq(schema.wirelessDevices.id, id))
      .run();
  }
}
