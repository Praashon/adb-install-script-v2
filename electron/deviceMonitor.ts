import { DeviceRepository } from "@core/database/repositories/deviceRepository";
import { EventBus } from "@core/event-bus/eventBus";
import { AdbManager, AdbDevice } from "@adb-engine/adbManager";
const POLL_INTERVAL_MS = 3000;
export interface DeviceSnapshot extends AdbDevice {
  isPreferred: boolean;
}
export class DeviceMonitor {
  private timer: NodeJS.Timeout | null = null;
  private polling = false;
  private lastSignature = "";
  private lastDevices: DeviceSnapshot[] = [];
  private adbAvailable: boolean | null = null;
  private reconnectAttempts = new Set<string>();
  constructor(
    private deviceRepo: DeviceRepository,
    private eventBus: EventBus,
    private createAdbManager: () => AdbManager,
  ) {}
  start(): void {
    if (this.timer) return;
    void this.poll();
    this.timer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
  }
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
  getLastDevices(): DeviceSnapshot[] {
    return this.lastDevices;
  }
  async refresh(): Promise<DeviceSnapshot[]> {
    await this.poll(true);
    return this.lastDevices;
  }
  async isAdbAvailable(): Promise<boolean> {
    const available = await this.createAdbManager().isAvailable();
    this.adbAvailable = available;
    return available;
  }
  private async poll(force = false): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const adb = this.createAdbManager();
      const devices = await adb.listDevices();
      if (this.adbAvailable === false) {
        this.eventBus.adb("info", "ADB is available again");
      }
      this.adbAvailable = true;
      const preferred = this.deviceRepo.findPreferred();
      for (const device of devices) {
        this.deviceRepo.upsert({
          serial: device.serial,
          model: device.model,
          manufacturer: device.manufacturer,
          androidVersion: device.androidVersion,
          architecture: device.architecture,
          status: device.status,
        });
      }
      const seen = new Set(devices.map((d) => d.serial));
      for (const known of this.deviceRepo.findAll()) {
        if (!seen.has(known.serial) && known.status !== "offline") {
          this.deviceRepo.updateStatus(known.serial, "offline");
        }
      }
      for (const device of devices) {
        if (
          device.status === "offline" &&
          !this.reconnectAttempts.has(device.serial)
        ) {
          this.reconnectAttempts.add(device.serial);
          void adb.reconnect(device.serial);
        }
      }
      for (const serial of [...this.reconnectAttempts]) {
        const current = devices.find((d) => d.serial === serial);
        if (!current || current.status !== "offline") {
          this.reconnectAttempts.delete(serial);
        }
      }
      let preferredSerial = preferred?.serial;
      const onlineDevices = devices.filter((d) => d.status === "online");
      if (
        onlineDevices.length > 0 &&
        (!preferredSerial ||
          !onlineDevices.some((d) => d.serial === preferredSerial))
      ) {
        preferredSerial = onlineDevices[0].serial;
        this.deviceRepo.setPreferred(preferredSerial);
      }
      const snapshots: DeviceSnapshot[] = devices.map((device) => ({
        ...device,
        isPreferred: device.serial === preferredSerial,
      }));
      const signature = JSON.stringify(
        snapshots.map((d) => [d.serial, d.status, d.model, d.isPreferred]),
      );
      this.lastDevices = snapshots;
      if (signature !== this.lastSignature) {
        this.announceChanges(this.lastSignature, snapshots);
        this.lastSignature = signature;
        this.emitUpdate(snapshots, true);
      } else if (force) {
        this.emitUpdate(snapshots, false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (this.adbAvailable !== false) {
        this.adbAvailable = false;
        this.eventBus.adb("error", message);
      }
      this.lastDevices = [];
      if (this.lastSignature !== "unavailable") {
        this.lastSignature = "unavailable";
        this.emitUpdate([], true, message);
      } else if (force) {
        this.emitUpdate([], false, message);
      }
    } finally {
      this.polling = false;
    }
  }
  private announceChanges(
    previousSignature: string,
    devices: DeviceSnapshot[],
  ): void {
    if (!previousSignature) return;
    let previous: [string, string, string, boolean][] = [];
    try {
      previous = JSON.parse(previousSignature);
    } catch {
      return;
    }
    const previousBySerial = new Map(
      previous.map(([serial, status]) => [serial, status]),
    );
    for (const device of devices) {
      const before = previousBySerial.get(device.serial);
      if (before === undefined) {
        this.eventBus.adb(
          "info",
          `Device connected: ${device.model || device.serial}`,
          {
            serial: device.serial,
            status: device.status,
          },
        );
      } else if (before !== device.status) {
        this.eventBus.adb(
          device.status === "online" ? "info" : "warn",
          `Device ${device.model || device.serial} is now ${device.status}`,
          { serial: device.serial, status: device.status },
        );
      }
      previousBySerial.delete(device.serial);
    }
    for (const [serial] of previousBySerial) {
      this.eventBus.adb("warn", `Device disconnected: ${serial}`, { serial });
    }
  }
  private emitUpdate(
    devices: DeviceSnapshot[],
    changed: boolean,
    error?: string,
  ): void {
    this.eventBus.emit("device:update", {
      source: "adb-engine",
      level: error ? "warn" : "info",
      message: error ?? `${devices.length} device(s) detected`,
      data: { devices, changed, error, adbAvailable: !error },
    });
  }
}
