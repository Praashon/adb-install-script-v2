import { WirelessDeviceRepository } from "@core/database/repositories/wirelessDeviceRepository";
import { EventBus } from "@core/event-bus/eventBus";
import { AdbManager } from "@adb-engine/adbManager";
import { DeviceMonitor } from "./deviceMonitor";

const INTERVAL_MS = 15000;

export class WirelessReconnector {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;

  constructor(
    private repo: WirelessDeviceRepository,
    private deviceMonitor: DeviceMonitor,
    private createAdb: () => AdbManager,
    private eventBus: EventBus,
  ) {}

  start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async reconnectNow(): Promise<void> {
    await this.tick(true);
  }

  private async tick(force = false): Promise<void> {
    if (this.busy && !force) return;
    this.busy = true;

    try {
      const saved = this.repo.findAutoConnect();
      if (saved.length === 0) return;

      const connected = new Set(
        this.deviceMonitor.getLastDevices().map((d) => d.serial),
      );
      const adb = this.createAdb();
      let reconnected = 0;

      for (const device of saved) {
        if (connected.has(device.address)) continue;
        const result = await adb.connect(device.address);
        if (result.success) {
          this.repo.markConnected(device.address);
          reconnected += 1;
        }
      }

      if (reconnected > 0) {
        this.eventBus.adb(
          "info",
          `Reconnected ${reconnected} saved wireless device(s)`,
        );
        await this.deviceMonitor.refresh();
      }
    } finally {
      this.busy = false;
    }
  }
}
