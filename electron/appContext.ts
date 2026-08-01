import { app } from "electron";
import { join } from "path";
import { mkdirSync } from "fs";
import { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@core/database/schema";
import { EventBus, AppEvent } from "@core/event-bus/eventBus";
import { JobRunner } from "@core/job-manager/jobRunner";
import { JobQueue } from "@core/job-manager/jobQueue";
import { registerJobSteps, JobSettings } from "@core/job-manager/steps";
import { SourceRepository } from "@core/database/repositories/sourceRepository";
import { AdapterRepository } from "@core/database/repositories/adapterRepository";
import { JobRepository } from "@core/database/repositories/jobRepository";
import { DownloadRepository } from "@core/database/repositories/downloadRepository";
import { DeviceRepository } from "@core/database/repositories/deviceRepository";
import { SettingsRepository } from "@core/database/repositories/settingsRepository";
import { InstalledAppRepository } from "@core/database/repositories/installedAppRepository";
import { LogRepository } from "@core/database/repositories/logRepository";
import { AdapterManager } from "@source-engine/adapterManager";
import { FailureTracker } from "@adapter-monitor/failureTracker";
import { HealthChecker } from "@adapter-monitor/healthChecker";
import { AdbManager } from "@adb-engine/adbManager";
import { DeviceMonitor } from "./deviceMonitor";
export interface AppContext {
  db: BetterSQLite3Database<typeof schema>;
  eventBus: EventBus;
  jobRunner: JobRunner;
  jobQueue: JobQueue;
  sourceRepo: SourceRepository;
  adapterRepo: AdapterRepository;
  jobRepo: JobRepository;
  downloadRepo: DownloadRepository;
  deviceRepo: DeviceRepository;
  settingsRepo: SettingsRepository;
  installedAppRepo: InstalledAppRepository;
  logRepo: LogRepository;
  adapterManager: AdapterManager;
  failureTracker: FailureTracker;
  healthChecker: HealthChecker;
  deviceMonitor: DeviceMonitor;
  getSettings(): JobSettings;
  createAdbManager(): AdbManager;
  paths: {
    builtInPlugins: string;
    userPlugins: string;
    downloads: string;
    work: string;
  };
  dispose(): void;
}
export async function createAppContext(
  db: BetterSQLite3Database<typeof schema>,
  eventBus: EventBus,
): Promise<AppContext> {
  const sourceRepo = new SourceRepository(db);
  const adapterRepo = new AdapterRepository(db);
  const jobRepo = new JobRepository(db);
  const downloadRepo = new DownloadRepository(db);
  const deviceRepo = new DeviceRepository(db);
  const settingsRepo = new SettingsRepository(db);
  const installedAppRepo = new InstalledAppRepository(db);
  const logRepo = new LogRepository(db);
  const userData = app.getPath("userData");
  const paths = {
    builtInPlugins: app.isPackaged
      ? join(process.resourcesPath, "sources", "plugins")
      : join(app.getAppPath(), "sources", "plugins"),
    userPlugins: join(userData, "plugins"),
    downloads: join(app.getPath("downloads"), "ADB Installer"),
    work: join(userData, "work"),
  };
  mkdirSync(paths.userPlugins, { recursive: true });
  mkdirSync(paths.work, { recursive: true });
  const getSettings = (): JobSettings => {
    const configuredDir = settingsRepo.get("download.directory")?.trim();
    return {
      adbPath: settingsRepo.get("adb.path")?.trim() ?? "",
      downloadDirectory:
        configuredDir && configuredDir.length > 0
          ? configuredDir
          : paths.downloads,
      browserEnabled: settingsRepo.get("browser.enabled") !== "false",
      browserAssisted: settingsRepo.get("browser.assisted") === "true",
      allowDowngrade: settingsRepo.get("install.allowDowngrade") === "true",
      grantPermissions: settingsRepo.get("install.grantPermissions") === "true",
      launchAfterInstall:
        settingsRepo.get("install.launchAfterInstall") === "true",
    };
  };
  const createAdbManager = (): AdbManager =>
    new AdbManager(getSettings().adbPath);
  const adapterManager = new AdapterManager(
    sourceRepo,
    adapterRepo,
    paths.builtInPlugins,
    paths.userPlugins,
  );
  const { loaded, failed } = await adapterManager.loadAll();
  eventBus.log("source-engine", "info", `Loaded ${loaded} source adapter(s)`);
  for (const failure of failed) {
    eventBus.log(
      "source-engine",
      "error",
      `Plugin "${failure.plugin}" failed to load: ${failure.error}`,
    );
  }
  const failureTracker = new FailureTracker(sourceRepo, adapterRepo, eventBus);
  const healthChecker = new HealthChecker(sourceRepo, adapterRepo, eventBus);
  const jobRunner = new JobRunner(db, eventBus);
  const jobQueue = new JobQueue(db, eventBus);
  registerJobSteps(jobRunner, {
    eventBus,
    jobRepo,
    sourceRepo,
    adapterRepo,
    downloadRepo,
    deviceRepo,
    installedAppRepo,
    adapterManager,
    failureTracker,
    getSettings,
    workDir: paths.work,
  });
  const maxConcurrent = parseInt(
    settingsRepo.get("download.maxConcurrent") ?? "2",
    10,
  );
  jobRunner.setMaxConcurrent(
    Number.isFinite(maxConcurrent) ? maxConcurrent : 2,
  );
  const deviceMonitor = new DeviceMonitor(
    deviceRepo,
    eventBus,
    createAdbManager,
  );
  const persistLog = (eventName: string, event: AppEvent): void => {
    if (eventName === "job:update") return;
    if (event.level === "debug") return;
    logRepo.create({
      level: event.level,
      source: event.source,
      message: event.message,
      metadata: event.data,
      jobId: event.jobId,
    });
  };
  const unsubscribeLogs = eventBus.onAny(persistLog);
  logRepo.pruneOlderThan(14);
  return {
    db,
    eventBus,
    jobRunner,
    jobQueue,
    sourceRepo,
    adapterRepo,
    jobRepo,
    downloadRepo,
    deviceRepo,
    settingsRepo,
    installedAppRepo,
    logRepo,
    adapterManager,
    failureTracker,
    healthChecker,
    deviceMonitor,
    getSettings,
    createAdbManager,
    paths,
    dispose(): void {
      unsubscribeLogs();
      deviceMonitor.stop();
    },
  };
}
