import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { initializeDatabase, closeDatabase } from "../core/database/connection";
import { SettingsRepository } from "../core/database/repositories/settingsRepository";
import { JobRepository } from "../core/database/repositories/jobRepository";
import { DeviceRepository } from "../core/database/repositories/deviceRepository";
import { JobQueue } from "../core/job-manager/jobQueue";
import { JobRunner } from "../core/job-manager/jobRunner";
import { EventBus } from "../core/event-bus/eventBus";

async function main() {
  const directory = mkdtempSync(join(tmpdir(), "adb-native-tests-"));
  try {
    let db = initializeDatabase(join(directory, "test.db"));
    new SettingsRepository(db).set("ui.theme", "light");
    closeDatabase();
    db = initializeDatabase(join(directory, "test.db"));
    assert.equal(new SettingsRepository(db).get("ui.theme"), "light", "migration must preserve settings");
    const events = new EventBus();
    const devices = new DeviceRepository(db);
    devices.upsert({ serial: "fixture-a", model: "Fixture A", status: "online", manufacturer: "Fixture", androidVersion: "14", architecture: "arm64-v8a" });
    devices.upsert({ serial: "fixture-b", model: "Fixture B", status: "online", manufacturer: "Fixture", androidVersion: "14", architecture: "arm64-v8a" });
    const queue = new JobQueue(db, events);
    const jobs = new JobRepository(db);
    const a = await queue.enqueue("https://example.com/a.apk", "fixture-a");
    const a2 = await queue.enqueue("https://example.com/a2.apk", "fixture-a");
    const b = await queue.enqueue("https://example.com/b.apk", "fixture-b");
    assert.equal(queue.getNext(new Set([a]), new Set(["fixture-a"]))?.jobId, b, "busy devices must not block independent queues");
    await assert.rejects(queue.enqueue("https://example.com/no.apk", "missing"), /not known/);
    await assert.rejects(queue.requeueFailed(a), /Only failed/);
    for (const id of [a, a2, b]) jobs.updateStatus(id, "cancelled");
    const uncertain = jobs.create({ url: "https://example.com/uncertain.apk", type: "install" });
    jobs.updateStatus(uncertain, "running"); jobs.updateProgress(uncertain, 70, "install_apk");
    const runner = new JobRunner(db, events);
    await runner.recoverPendingJobs();
    assert.equal(jobs.findById(uncertain)?.status, "paused", "uncertain installs must not replay after restart");
    const incomplete = jobs.create({ url: "https://example.com/incomplete.apk", type: "download" });
    runner.processNext();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(jobs.findById(incomplete)?.status, "failed", "missing step handlers must never report success");
    const paused = jobs.create({ url: "https://example.com/paused.apk", type: "download" });
    await runner.pauseJob(paused); assert.equal(jobs.findById(paused)?.status, "paused");
    await runner.cancelJob(paused); assert.equal(jobs.findById(paused)?.status, "cancelled");
    runner.registerStep("detect_source", (context, helpers) => new Promise((resolve) => {
      helpers.signal.addEventListener("abort", () => resolve(context), { once: true });
    }));
    const active = jobs.create({ url: "https://example.com/active.apk", type: "download" });
    runner.processNext();
    assert.equal(runner.isRunning(active), true);
    await runner.cancelJob(active);
    assert.equal(runner.isRunning(active), false);
    assert.equal(jobs.findById(active)?.status, "cancelled", "cancel must settle before returning");
    const shutdown = jobs.create({ url: "https://example.com/shutdown.apk", type: "download" });
    runner.processNext();
    await runner.shutdown();
    assert.equal(runner.isRunning(shutdown), false);
    assert.equal(jobs.findById(shutdown)?.status, "paused", "shutdown settles jobs before SQLite closes");
    console.log("Native integration: settings migration, target validation, per-device scheduling, retry guard, crash recovery, missing-step failure, pause and cancel passed.");
  } finally { closeDatabase(); rmSync(directory, { recursive: true, force: true }); }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
