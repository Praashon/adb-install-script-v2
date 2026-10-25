import { RetryManager } from "../core/job-manager/retryManager";
import { describe, it, expect, vi } from "vitest";
import { WirelessReconnector } from "../electron/wirelessReconnector";
import { EventBus } from "../core/event-bus/eventBus";
import type { WirelessDeviceRepository } from "../core/database/repositories/wirelessDeviceRepository";
import type { DeviceMonitor } from "../electron/deviceMonitor";
import type { AdbManager } from "../adb-engine/adbManager";

describe("wireless reconnection", () => {
  it("retries offline saved devices and never overlaps a forced reconnect", async () => {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => release = resolve);
    const connect = vi.fn(async () => { await waiting; return { success: true }; });
    const repo = { findAutoConnect: () => [{ address: "192.168.1.2:5555" }], markConnected: vi.fn() };
    const monitor = { getLastDevices: () => [{ serial: "192.168.1.2:5555", status: "offline" }], refresh: vi.fn() };
    const reconnector = new WirelessReconnector(repo as unknown as WirelessDeviceRepository, monitor as unknown as DeviceMonitor,
      () => ({ connect }) as unknown as AdbManager, new EventBus());
    const first = reconnector.reconnectNow();
    await reconnector.reconnectNow();
    expect(connect).toHaveBeenCalledOnce();
    release(); await first;
    expect(repo.markConnected).toHaveBeenCalledWith("192.168.1.2:5555");
    expect(monitor.refresh).toHaveBeenCalledOnce();
  });
  it("contains rejected background reconnection attempts", async () => {
    const repo = { findAutoConnect: () => { throw new Error("fixture database error"); } };
    const reconnector = new WirelessReconnector(repo as unknown as WirelessDeviceRepository, {} as DeviceMonitor, () => ({} as AdbManager), new EventBus());
    await expect(reconnector.reconnectNow()).resolves.toBeUndefined();
  });
});

it("interrupts retry backoff immediately when cancellation is requested", async () => {
  const retry = new RetryManager({ baseDelayMs: 30000 });
  const controller = new AbortController();
  const waiting = retry.waitForRetry("fixture", controller.signal);
  controller.abort();
  await waiting;
});
