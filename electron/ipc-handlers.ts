import { safeFetch, limitedText } from "@security-engine/network";
import { approveDeviceAction } from "./deviceApproval";
import { ipcMain, BrowserWindow, shell, dialog, app } from "electron";
import { readFileSync, mkdirSync, statSync } from "fs";
import { unlink } from "fs/promises";
import { basename, join } from "path";
import { is } from "@electron-toolkit/utils";
import { isTrustedRendererUrl, externalHttpUrl } from "./rendererTrust";
import { AppContext } from "./appContext";
import { AdapterRules } from "@security-engine/adapterValidator";
import { SourceDetector } from "@source-engine/sourceDetector";
import { Parser } from "@source-engine/parser";
export function registerIpcHandlers(ctx: AppContext): void {
  registerWindowHandlers();
  registerJobHandlers(ctx);
  registerSourceHandlers(ctx);
  registerDeviceHandlers(ctx);
  registerDownloadHandlers(ctx);
  registerSettingsHandlers(ctx);
  registerAppHandlers(ctx);
}
function handle<T extends unknown[], R>(
  channel: string,
  fn: (...args: T) => Promise<R> | R,
): void {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, async (event, ...args) => {
    assertTrustedSender(event);
    try {
      return await fn(...(args as T));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });
}
function assertTrustedSender(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): void {
  const frame = event.senderFrame;
  if (!BrowserWindow.fromWebContents(event.sender) || !frame || frame !== event.sender.mainFrame ||
      !isTrustedRendererUrl(frame.url, join(__dirname, "../renderer/index.html"),
        is.dev ? process.env.ELECTRON_RENDERER_URL : undefined)) {
    throw new Error("Untrusted IPC sender");
  }
}
function focusedWindow(): BrowserWindow | null {
  return (
    BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
  );
}
function openDialog(
  options: Electron.OpenDialogOptions,
): Promise<Electron.OpenDialogReturnValue> {
  const window = focusedWindow();
  return window
    ? dialog.showOpenDialog(window, options)
    : dialog.showOpenDialog(options);
}
function saveDialog(
  options: Electron.SaveDialogOptions,
): Promise<Electron.SaveDialogReturnValue> {
  const window = focusedWindow();
  return window
    ? dialog.showSaveDialog(window, options)
    : dialog.showSaveDialog(options);
}
function captureStamp(): string {
  return new Date()
    .toISOString()
    .replace(/\.\d+Z$/, "")
    .replace(/:/g, "-")
    .replace("T", "_");
}
function queueLocalInstall(
  ctx: AppContext,
  filePath: string,
  deviceSerial?: string,
): { jobId: string; filename: string } {
  const stats = statSync(filePath);
  const filename = basename(filePath);
  const url = `file:///${filePath.replace(/\\/g, "/")}`;
  const device = deviceSerial
    ? ctx.deviceRepo.findBySerial(deviceSerial)
    : ctx.deviceRepo.findPreferred();

  if (deviceSerial && !device) throw new Error("Selected device is not known; refresh devices and retry");
  const jobId = ctx.jobRepo.create({
    url,
    type: "install",
    deviceId: device?.id,
  });
  const downloadId = ctx.downloadRepo.create({
    jobId,
    url,
    filename,
    filePath,
    fileSize: stats.size,
  });
  ctx.jobRepo.saveContext(jobId, {
    jobId,
    url,
    deviceId: device?.id,
    deviceSerial: device?.serial,
    downloadId,
    downloadPath: filePath,
    filename,
    fileSize: stats.size,
  });
  ctx.jobRepo.updateProgress(jobId, 0, "validate_package");
  ctx.eventBus.job(jobId, "info", `Installing ${filename} from disk`);
  return { jobId, filename };
}
function registerWindowHandlers(): void {
  ipcMain.removeAllListeners("window:minimize");
  ipcMain.removeAllListeners("window:maximize");
  ipcMain.removeAllListeners("window:close");
  ipcMain.on("window:minimize", (event) => {
    assertTrustedSender(event);
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.on("window:maximize", (event) => {
    assertTrustedSender(event);
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on("window:close", (event) => {
    assertTrustedSender(event);
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
  handle("window:isMaximized", () => focusedWindow()?.isMaximized() ?? false);
}
function registerJobHandlers(ctx: AppContext): void {
  handle("job:create", async (url: string, deviceSerial?: string) => {
    const jobId = await ctx.jobQueue.enqueue(url, deviceSerial);
    ctx.jobRunner.processNext();
    return jobId;
  });
  handle("job:createDownload", async (url: string) => {
    const jobId = await ctx.jobQueue.enqueueDownload(url);
    ctx.jobRunner.processNext();
    return jobId;
  });
  handle("job:createFromFile", async (deviceSerial?: string) => {
    const picked = await openDialog({
      title: "Select an APK to install",
      filters: [
        {
          name: "Android packages",
          extensions: ["apk", "xapk", "apks", "apkm", "zip"],
        },
        { name: "All files", extensions: ["*"] },
      ],
      properties: ["openFile"],
    });
    if (picked.canceled || picked.filePaths.length === 0) {
      return { cancelled: true };
    }
    const { jobId, filename } = queueLocalInstall(
      ctx,
      picked.filePaths[0],
      deviceSerial,
    );
    ctx.jobRunner.processNext();
    return { cancelled: false, jobId, filename };
  });

  handle(
    "job:createFromPaths",
    async (paths: string[], deviceSerial?: string) => {
      const installable = (paths ?? []).filter((p) =>
        /\.(apk|xapk|apks|apkm)$/i.test(p),
      );
      if (installable.length === 0) {
        throw new Error("None of the dropped files are Android packages.");
      }

      let queued = 0;
      for (const filePath of installable) {
        try {
          queueLocalInstall(ctx, filePath, deviceSerial);
          queued += 1;
        } catch (error) {
          ctx.eventBus.log(
            "job-manager",
            "warn",
            `Skipped ${basename(filePath)}: ${
              error instanceof Error ? error.message : "unreadable"
            }`,
          );
        }
      }

      ctx.jobRunner.processNext();
      return { queued, skipped: paths.length - queued };
    },
  );

  handle("job:getAll", () => ctx.jobRepo.findAll());
  handle("job:getById", (id: string) => ctx.jobRepo.findById(id));
  handle("job:cancel", (id: string) => ctx.jobRunner.cancelJob(id));
  handle("job:retry", async (id: string) => {
    await ctx.jobQueue.requeueFailed(id);
    ctx.jobRunner.processNext();
  });
  handle("job:pause", (id: string) => ctx.jobRunner.pauseJob(id));
  handle("job:resume", (id: string) => ctx.jobRunner.resumeJob(id));
  handle("job:remove", async (id: string) => {
    await ctx.jobRunner.cancelJob(id);
    ctx.jobRepo.remove(id);
  });
  handle("job:getLogs", (id: string) => ctx.logRepo.findByJobId(id));
  handle("job:clearFinished", () => {
    const removable = ctx.jobRepo
      .findAll()
      .filter((job) =>
        ["completed", "failed", "cancelled"].includes(job.status),
      );
    for (const job of removable) ctx.jobRepo.remove(job.id);
    return removable.length;
  });
}
function registerSourceHandlers(ctx: AppContext): void {
  handle("source:detect", (url: string) => {
    const detector = new SourceDetector(ctx.sourceRepo, ctx.adapterRepo);
    return detector.detect(url);
  });
  handle("source:getAll", () => {
    const health = new Map(
      ctx.healthChecker.getHealthStatus().map((h) => [h.sourceId, h]),
    );
    return ctx.sourceRepo.findAll().map((source) => {
      const stats = health.get(source.id);
      const adapter = ctx.adapterManager.getAdapterBySourceId(source.id);
      return {
        ...source,
        successRate: stats?.successRate ?? 100,
        totalAttempts: stats?.totalAttempts ?? 0,
        failureCount: stats?.failureCount ?? 0,
        lastTested: stats?.lastTested ?? null,
        activeAdapterVersion: stats?.activeAdapterVersion ?? 1,
        hasAdapter: Boolean(adapter),
        supportedFormats: adapter?.manifest.supportedFormats ?? [],
      };
    });
  });
  handle("source:getById", (id: string) => {
    const source = ctx.sourceRepo.findById(id);
    if (!source) throw new Error("Source not found");
    const adapter = ctx.adapterManager.getAdapterBySourceId(id);
    const version = ctx.adapterRepo.findActiveBySourceId(id);
    return {
      ...source,
      rules: adapter?.rules ?? null,
      manifest: adapter?.manifest ?? null,
      versions: ctx.adapterRepo.findBySourceId(id),
      activeVersion: version?.version ?? null,
    };
  });
  handle(
    "source:create",
    async (data: { name: string; domain: string; rules: AdapterRules }) => {
      if (!data?.name?.trim()) throw new Error("Adapter name is required");
      if (!data?.domain?.trim()) throw new Error("Domain is required");
      return ctx.adapterManager.saveCustomAdapter(
        data.name.trim(),
        data.domain.trim(),
        data.rules,
      );
    },
  );
  handle(
    "source:update",
    async (
      id: string,
      data: {
        name?: string;
        rules?: AdapterRules;
        status?: string;
      },
    ) => {
      if (data.rules) {
        await ctx.adapterManager.updateAdapter(id, data.rules, data.name);
        return;
      }
      ctx.sourceRepo.update(id, {
        ...(data.name ? { name: data.name } : {}),
        ...(data.status
          ? {
              status: data.status as
                "healthy" | "degraded" | "broken" | "disabled",
            }
          : {}),
      });
    },
  );
  handle("source:remove", (id: string) => ctx.adapterManager.removeSource(id));
  handle("source:setEnabled", (id: string, enabled: boolean) => {
    ctx.sourceRepo.updateStatus(id, enabled ? "healthy" : "disabled");
  });
  handle("source:test", async (id: string, testUrl?: string) => {
    const source = ctx.sourceRepo.findById(id);
    if (!source) throw new Error("Source not found");
    const started = Date.now();
    const health = await ctx.healthChecker.checkSource(id);
    if (health?.status === "broken") {
      return {
        success: false,
        reachable: false,
        message: `${source.domain} is unreachable`,
        durationMs: Date.now() - started,
      };
    }
    const adapter = ctx.adapterManager.getAdapterBySourceId(id);
    const url = testUrl?.trim() || source.url;
    try {
      const response = await safeFetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          ...(adapter?.sandboxed.getAllHeaders() ?? {}),
        },
        redirect: "follow",
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) {
        return {
          success: false,
          reachable: true,
          message: `${url} returned HTTP ${response.status}`,
          durationMs: Date.now() - started,
        };
      }
      const html = await limitedText(response);
      const parser = new Parser();
      const parsed = await parser.parseDownloadPage(
        html,
        url,
        adapter?.sandboxed ?? ctx.adapterManager.getFallbackAdapter(),
      );
      const durationMs = Date.now() - started;
      if (!parsed) {
        return {
          success: false,
          reachable: true,
          message:
            "The site responded, but no download link matched the adapter selectors. Try testing against a specific app page URL.",
          durationMs,
        };
      }
      return {
        success: true,
        reachable: true,
        message: `Matched a ${parsed.fileType.toUpperCase()} link: ${parsed.filename}`,
        downloadUrl: parsed.downloadUrl,
        durationMs,
      };
    } catch (error) {
      return {
        success: false,
        reachable: true,
        message: error instanceof Error ? error.message : "Test failed",
        durationMs: Date.now() - started,
      };
    }
  });
  handle("source:analyze", async (url: string) => {
    if (!/^https?:\/\//i.test(url?.trim() ?? "")) {
      throw new Error("Enter a full URL starting with http:// or https://");
    }
    const { WebsiteAnalyzer } = await import("@source-engine/websiteAnalyzer");
    const analyzer = new WebsiteAnalyzer();
    const result = await analyzer.analyze(url.trim());
    if (result.confidence === 0) {
      throw new Error(
        "No download links were found on that page. Try a page that has a visible download button.",
      );
    }
    return result;
  });
  handle("source:import", async () => {
    const result = await openDialog({
      title: "Import source plugin",
      filters: [{ name: "Adapter plugin", extensions: ["json"] }],
      properties: ["openFile"],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { cancelled: true };
    }
    const raw = JSON.parse(readFileSync(result.filePaths[0], "utf-8"));
    const sourceId = await ctx.adapterManager.importBundle(raw);
    ctx.eventBus.source(
      "info",
      `Imported plugin from ${basename(result.filePaths[0])}`,
    );
    return { cancelled: false, sourceId };
  });
  handle("source:export", async (id: string) => {
    const source = ctx.sourceRepo.findById(id);
    if (!source) throw new Error("Source not found");
    const bundle = ctx.adapterManager.exportBundle(id);
    const result = await saveDialog({
      title: "Export source plugin",
      defaultPath: `${source.domain.replace(/[^a-z0-9]+/gi, "-")}-adapter.json`,
      filters: [{ name: "Adapter plugin", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePath) {
      return { cancelled: true };
    }
    const { writeFileSync } = await import("fs");
    writeFileSync(result.filePath, JSON.stringify(bundle, null, 2), "utf-8");
    ctx.eventBus.source("info", `Exported ${source.name} adapter`);
    return { cancelled: false, filePath: result.filePath };
  });
  handle("source:reload", async () => {
    const { loaded, failed } = await ctx.adapterManager.loadAll();
    ctx.eventBus.source("info", `Reloaded ${loaded} adapter(s)`);
    return { loaded, failed };
  });
}
function registerDeviceHandlers(ctx: AppContext): void {
  handle("device:list", () => ctx.deviceMonitor.getLastDevices());
  handle("device:refresh", () => ctx.deviceMonitor.refresh());
  handle("device:getInfo", async (serial: string) => {
    const adb = ctx.createAdbManager();
    return adb.getDeviceInfo(serial);
  });
  handle("device:setPreferred", (serial: string) => {
    ctx.deviceRepo.setPreferred(serial);
    ctx.eventBus.adb("info", `Preferred device set to ${serial}`, { serial });
  });
  handle(
    "device:getInstalledApps",
    async (serial: string, includeSystem?: boolean) => {
      const adb = ctx.createAdbManager();
      const packages = await adb.listPackages(serial, includeSystem === true);
      const device = ctx.deviceRepo.findBySerial(serial);
      const known = device
        ? new Map(
            ctx.installedAppRepo
              .findByDeviceId(device.id)
              .map((a) => [a.packageName, a]),
          )
        : new Map();
      return packages.map((pkg) => {
        const record = known.get(pkg.packageName);
        return {
          packageName: pkg.packageName,
          isSystem: pkg.isSystem,
          versionName: record?.versionName ?? null,
          installedByApp: Boolean(record),
          installedAt: record?.installedAt ?? null,
        };
      });
    },
  );
  handle("device:uninstall", async (serial: string, packageName: string) => {
    const adb = ctx.createAdbManager();
    await approveDeviceAction(serial, packageName, "uninstall", (options) => dialog.showMessageBox(options));
    const result = await adb.uninstall(packageName, serial);
    if (!result.success) return { success: false, canDisable: true, error: result.error };
    const device = ctx.deviceRepo.findBySerial(serial);
    if (device) ctx.installedAppRepo.removeByPackage(packageName, device.id);
    ctx.eventBus.adb("info", `Uninstalled ${packageName}`, {
      serial,
      mode: result.mode,
    });
    return { success: true, mode: result.mode };
  });
  handle("device:disableApp", async (serial: string, packageName: string) => {
    const adb = ctx.createAdbManager();
    await approveDeviceAction(serial, packageName, "disable", (options) => dialog.showMessageBox(options));
    const result = await adb.disableForUser(packageName, serial);
    if (!result.success) {
      throw new Error(result.error || `Could not disable ${packageName}`);
    }
    const device = ctx.deviceRepo.findBySerial(serial);
    if (device) ctx.installedAppRepo.removeByPackage(packageName, device.id);
    ctx.eventBus.adb("info", `Disabled ${packageName} for the current user`, {
      serial,
    });
    return { success: true };
  });
  handle("device:scanBloat", async (serial: string) => {
    const { matchBloat, catalogSize } = await import(
      "@adb-engine/bloatCatalog"
    );
    const adb = ctx.createAdbManager();
    const packages = await adb.listPackages(serial, true);
    const matches = matchBloat(packages.map((p) => p.packageName));
    return { matches, scanned: packages.length, catalogSize: catalogSize() };
  });

  handle(
    "device:removeBloat",
    async (serial: string, packageName: string) => {
      const adb = ctx.createAdbManager();

      await approveDeviceAction(serial, packageName, "remove-user", (options) => dialog.showMessageBox(options));
      const result = await adb.uninstallForUser(packageName, serial);

      if (!result.success) {
        throw new Error(
          result.error || `Could not remove ${packageName}`,
        );
      }

      const device = ctx.deviceRepo.findBySerial(serial);
      if (device) ctx.installedAppRepo.removeByPackage(packageName, device.id);

      ctx.eventBus.adb(
        "info",
        `Debloat removed ${packageName} (${result.mode})`,
        { serial, mode: result.mode },
      );
      return { success: true, mode: result.mode };
    },
  );

  handle("device:extractApp", async (serial: string, packageName: string) => {
    const adb = ctx.createAdbManager();
    const paths = await adb.getPackagePaths(packageName, serial);
    if (paths.length === 0) {
      throw new Error(`Could not locate ${packageName} on the device`);
    }

    const picked = await openDialog({
      title: "Choose where to save the APK",
      defaultPath: ctx.getSettings().downloadDirectory,
      properties: ["openDirectory", "createDirectory"],
    });
    if (picked.canceled || picked.filePaths.length === 0) {
      return { cancelled: true };
    }

    const safeName = packageName.replace(/[^a-z0-9._-]+/gi, "_");
    const dest = join(picked.filePaths[0], safeName);
    mkdirSync(dest, { recursive: true });

    let pulled = 0;
    for (const devicePath of paths) {
      await adb.pullFile(devicePath, join(dest, basename(devicePath)), serial);
      pulled += 1;
    }

    ctx.eventBus.adb("info", `Extracted ${packageName} (${pulled} file(s))`, {
      serial,
      folder: dest,
    });
    shell.showItemInFolder(join(dest, basename(paths[0])));
    return { cancelled: false, folder: dest, files: pulled };
  });

  handle("device:screenshot", async (serial: string) => {
    const { captureScreenshot } = await import("@adb-engine/mediaCapture");
    const adb = ctx.createAdbManager();
    const dir = join(ctx.getSettings().downloadDirectory, "captures");
    mkdirSync(dir, { recursive: true });
    const localPath = join(dir, `screenshot-${captureStamp()}.png`);
    await captureScreenshot(adb.getAdbPath(), serial, localPath);
    ctx.eventBus.adb("info", "Captured screenshot", { serial, path: localPath });
    shell.showItemInFolder(localPath);
    return { path: localPath };
  });

  handle("device:recordStart", async (serial: string) => {
    const { startRecording } = await import("@adb-engine/mediaCapture");
    const adb = ctx.createAdbManager();
    startRecording(adb.getAdbPath(), serial);
    ctx.eventBus.adb("info", "Screen recording started", { serial });
    return { recording: true };
  });

  handle("device:recordStop", async (serial: string) => {
    const { stopRecording } = await import("@adb-engine/mediaCapture");
    const adb = ctx.createAdbManager();
    const dir = join(ctx.getSettings().downloadDirectory, "captures");
    mkdirSync(dir, { recursive: true });
    const localPath = join(dir, `recording-${captureStamp()}.mp4`);
    await stopRecording(adb.getAdbPath(), serial, localPath);
    ctx.eventBus.adb("info", "Screen recording saved", { serial, path: localPath });
    shell.showItemInFolder(localPath);
    return { path: localPath };
  });

  handle("device:recordStatus", async (serial: string) => {
    const { isRecording } = await import("@adb-engine/mediaCapture");
    return { recording: isRecording(serial) };
  });

  handle("device:logcatStart", (serial: string) => {
    ctx.logcat.start(serial);
    return { running: true };
  });

  handle("device:logcatStop", (serial: string) => {
    ctx.logcat.stop(serial);
    return { running: false };
  });

  handle("device:logcatClear", async (serial: string) => {
    await ctx.logcat.clear(serial);
    return { ok: true };
  });

  handle("device:logcatStatus", (serial: string) => {
    return { running: ctx.logcat.isRunning(serial) };
  });

  handle("device:performance", async (serial: string) => {
    const adb = ctx.createAdbManager();
    return adb.getPerformance(serial);
  });

  handle("device:scrcpyStatus", () => ctx.scrcpy.status());

  handle("device:mirrorStart", (serial: string) => {
    ctx.scrcpy.start(serial);
    ctx.eventBus.adb("info", "Screen mirroring started", { serial });
    return { running: true };
  });

  handle("device:mirrorStop", (serial: string) => {
    ctx.scrcpy.stop(serial);
    return { running: false };
  });

  handle("device:mirrorStatus", (serial: string) => {
    return { running: ctx.scrcpy.isRunning(serial) };
  });

  handle(
    "device:getPermissions",
    async (serial: string, packageName: string) => {
      const adb = ctx.createAdbManager();
      return adb.getAppPermissions(packageName, serial);
    },
  );

  handle(
    "device:setPermission",
    async (
      serial: string,
      packageName: string,
      permission: string,
      grant: boolean,
    ) => {
      const adb = ctx.createAdbManager();
      if (grant) {
        await adb.grantPermission(packageName, permission, serial);
      } else {
        await adb.revokePermission(packageName, permission, serial);
      }
      ctx.eventBus.adb(
        "info",
        `${grant ? "Granted" : "Revoked"} ${permission} for ${packageName}`,
        { serial },
      );
      return { granted: grant };
    },
  );

  handle("device:pair", async (address: string, code: string) => {
    const adb = ctx.createAdbManager();
    const result = await adb.pair(address.trim(), code.trim());
    if (!result.success) throw new Error(result.message || "Pairing failed");
    ctx.eventBus.adb("info", `Paired with ${address.trim()}`);
    return result;
  });

  handle("device:connect", async (address: string) => {
    const adb = ctx.createAdbManager();
    const result = await adb.connect(address.trim());
    if (!result.success) throw new Error(result.message || "Connection failed");
    await ctx.deviceMonitor.refresh();
    return result;
  });
  handle("device:disconnect", async (address: string) => {
    const adb = ctx.createAdbManager();
    await adb.disconnect(address);
    await ctx.deviceMonitor.refresh();
  });

  handle("device:reconnect", async (serial: string) => {
    const adb = ctx.createAdbManager();
    await adb.reconnect(serial);
    await adb.reconnectOffline();
    await new Promise((resolve) => setTimeout(resolve, 800));
    await ctx.deviceMonitor.refresh();
    return { ok: true };
  });

  handle("wireless:list", () => ctx.wirelessRepo.findAll());

  handle(
    "wireless:save",
    (data: { address: string; label: string; autoConnect?: boolean }) => {
      if (!/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(data.address.trim())) {
        throw new Error("Enter an address like 192.168.1.42:5555");
      }
      return ctx.wirelessRepo.save({
        address: data.address.trim(),
        label: data.label.trim() || data.address.trim(),
        autoConnect: data.autoConnect,
      });
    },
  );

  handle("wireless:setAutoConnect", (id: string, autoConnect: boolean) => {
    ctx.wirelessRepo.setAutoConnect(id, autoConnect);
    if (autoConnect) void ctx.wirelessReconnector.reconnectNow();
  });

  handle("wireless:remove", (id: string) => ctx.wirelessRepo.remove(id));

  handle("wireless:connect", async (id: string) => {
    const saved = ctx.wirelessRepo.findAll().find((d) => d.id === id);
    if (!saved) throw new Error("Saved device not found");

    const adb = ctx.createAdbManager();
    const result = await adb.connect(saved.address);
    if (!result.success) throw new Error(result.message || "Connection failed");

    ctx.wirelessRepo.markConnected(saved.address);
    await ctx.deviceMonitor.refresh();
    return result;
  });

  handle("wireless:reconnectAll", async () => {
    await ctx.wirelessReconnector.reconnectNow();
    return { ok: true };
  });

  handle("wireless:stabilize", async (serial: string, label?: string) => {
    const adb = ctx.createAdbManager();

    const approval = await dialog.showMessageBox({
      type: "warning", title: "Enable legacy wireless ADB?", message: `Device: ${serial}`,
      detail: "This restarts ADB in TCP mode on port 5555. Devices on your network may reach the debugging service. Prefer Android 11+ pairing on trusted networks.",
      buttons: ["Cancel", "Enable TCP mode"], defaultId: 0, cancelId: 0, noLink: true,
    });
    if (approval.response !== 1) throw new Error("Wireless change cancelled");
    const tcp = await adb.tcpip(serial, 5555);
    if (!tcp.success) {
      throw new Error(
        tcp.message ||
          "Could not switch the device to TCP/IP mode. Connect it over USB first.",
      );
    }

    let address = await adb.getWlanAddress(serial, 5555);
    if (!address) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      address = await adb.getWlanAddress(serial, 5555);
    }
    if (!address) {
      throw new Error(
        "Switched to TCP/IP mode, but could not read the device Wi-Fi address. Make sure Wi-Fi is on.",
      );
    }


    await new Promise((resolve) => setTimeout(resolve, 1200));
    const connect = await adb.connect(address);
    const id = ctx.wirelessRepo.save({
      address,
      label: label?.trim() || address,
      autoConnect: true,
    });
    if (connect.success) ctx.wirelessRepo.markConnected(address);
    await ctx.deviceMonitor.refresh();

    return { address, connected: connect.success, id };
  });

  handle("wireless:keepAwake", async () => {
    throw new Error("Enable Wireless debugging in Android Settings. The app does not change developer settings automatically.");
  });
  handle("device:adbStatus", async () => {
    const adb = ctx.createAdbManager();
    const version = await adb.getVersion();
    return {
      available: version !== null,
      version,
      path: adb.getAdbPath(),
    };
  });
}
function registerDownloadHandlers(ctx: AppContext): void {
  handle("download:getAll", () => ctx.downloadRepo.findAll());
  handle("download:getById", (id: string) => ctx.downloadRepo.findById(id));
  handle("download:remove", async (id: string, deleteFile?: boolean) => {
    const download = ctx.downloadRepo.findById(id);
    if (!download) return;
    if (deleteFile !== false && download.filePath) {
      await unlink(download.filePath).catch(() => {});
    }
    ctx.downloadRepo.remove(id);
  });
  handle("download:openFolder", (id: string) => {
    const download = ctx.downloadRepo.findById(id);
    if (!download?.filePath)
      throw new Error("This download has no file on disk");
    shell.showItemInFolder(download.filePath);
  });
  handle("download:openFile", async (id: string) => {
    const download = ctx.downloadRepo.findById(id);
    if (!download?.filePath)
      throw new Error("This download has no file on disk");
    const error = await shell.openPath(download.filePath);
    if (error) throw new Error(error);
  });

  handle("download:analyzeFile", async () => {
    const picked = await openDialog({ title: "Analyze an APK offline", properties: ["openFile"],
      filters: [{ name: "Android packages", extensions: ["apk", "apks", "xapk", "apkm"] }] });
    if (picked.canceled || !picked.filePaths[0]) return null;
    const { analyzeApkFile } = await import("@apk-engine/apkAnalyzer");
    return analyzeApkFile(picked.filePaths[0]);
  });
  handle("download:analyze", async (id: string) => {
    const download = ctx.downloadRepo.findById(id);
    if (!download?.filePath) {
      throw new Error("This download has no file on disk");
    }
    const { existsSync } = await import("fs");
    if (!existsSync(download.filePath)) {
      throw new Error("The file for this download is no longer on disk");
    }
    const { analyzeApkFile } = await import("@apk-engine/apkAnalyzer");
    return analyzeApkFile(download.filePath);
  });
  handle("download:install", async (id: string, deviceSerial?: string) => {
    const download = ctx.downloadRepo.findById(id);
    if (!download) throw new Error("Download not found");
    if (!download.filePath)
      throw new Error("The file for this download is no longer on disk");
    const { existsSync } = await import("fs");
    if (!existsSync(download.filePath)) {
      throw new Error("The file for this download is no longer on disk");
    }
    const jobId = await ctx.jobQueue.enqueue(download.url, deviceSerial);
    ctx.jobRepo.saveContext(jobId, {
      jobId,
      url: download.url,
      deviceSerial,
      sourceId: download.sourceId ?? undefined,
      downloadId: download.id,
      downloadPath: download.filePath,
      filename: download.filename,
      fileSize: download.fileSize ?? undefined,
    });
    ctx.jobRepo.updateProgress(jobId, 0, "validate_package");
    ctx.jobRunner.processNext();
    return jobId;
  });
  handle("download:clearHistory", async (deleteFiles = false) => {
    const downloads = ctx.downloadRepo.findAll();
    for (const download of downloads) {
      if (deleteFiles && download.filePath) {
        await unlink(download.filePath).catch(() => {});
      }
      ctx.downloadRepo.remove(download.id);
    }
    return downloads.length;
  });
}
function registerSettingsHandlers(ctx: AppContext): void {
  handle("settings:get", (key: string) => ctx.settingsRepo.get(key));
  handle("settings:set", (key: string, value: unknown) => {
    const raw = typeof value === "string" ? value : JSON.stringify(value);
    ctx.settingsRepo.set(key, raw);
    applySettingSideEffects(ctx, key, raw);
  });
  handle("settings:setMany", (values: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(values)) {
      const raw = typeof value === "string" ? value : JSON.stringify(value);
      ctx.settingsRepo.set(key, raw);
      applySettingSideEffects(ctx, key, raw);
    }
  });
  handle("settings:getAll", () => ({
    ...ctx.settingsRepo.getAll(),
    "download.defaultDirectory": ctx.paths.downloads,
  }));
  handle("settings:pickDirectory", async (current?: string) => {
    const result = await openDialog({
      title: "Choose download folder",
      defaultPath: current || ctx.paths.downloads,
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
  handle("settings:pickAdbPath", async (current?: string) => {
    const result = await openDialog({
      title: "Locate adb executable",
      defaultPath: current || undefined,
      filters:
        process.platform === "win32"
          ? [{ name: "Executable", extensions: ["exe"] }]
          : [{ name: "All files", extensions: ["*"] }],
      properties: ["openFile"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
}
function applySettingSideEffects(
  ctx: AppContext,
  key: string,
  value: string,
): void {
  if (key === "download.maxConcurrent") {
    const parsed = parseInt(value, 10);
    if (Number.isFinite(parsed)) ctx.jobRunner.setMaxConcurrent(parsed);
  }
  if (key === "adb.path") {
    void ctx.deviceMonitor.refresh();
  }
}
function registerAppHandlers(ctx: AppContext): void {
  handle("app:getStats", () => {
    const jobs = ctx.jobRepo.findAll();
    const devices = ctx.deviceMonitor.getLastDevices();
    return {
      activeJobs: jobs.filter((j) =>
        ["queued", "running", "paused"].includes(j.status),
      ).length,
      completedJobs: jobs.filter((j) => j.status === "completed").length,
      failedJobs: jobs.filter((j) => j.status === "failed").length,
      totalDownloads: ctx.downloadRepo.findAll().length,
      installedApps: ctx.installedAppRepo.findAll().length,
      sources: ctx.sourceRepo.findAll().length,
      devicesOnline: devices.filter((d) => d.status === "online").length,
      devicesTotal: devices.length,
    };
  });
  handle("app:getRecentJobs", (limit?: number) =>
    ctx.jobRepo.findRecent(limit ?? 5),
  );
  handle("app:getLogs", (limit?: number) =>
    ctx.logRepo.findRecent(limit ?? 200),
  );
  handle("app:clearLogs", () => ctx.logRepo.clear());
  handle("app:getInstalledApps", () => ctx.installedAppRepo.findAll());
  handle("app:openExternal", async (url: string) => {
    if (!/^https?:\/\//i.test(url))
      throw new Error("Only http(s) links can be opened");
    await shell.openExternal(externalHttpUrl(url));
  });
  handle("app:getInfo", async () => {
    const adb = ctx.createAdbManager();
    const [adbVersion, adapters] = await Promise.all([
      adb.getVersion(),
      Promise.resolve(ctx.adapterManager.getAllAdapters().length),
    ]);
    return {
      version: app.getVersion(),
      electron: process.versions.electron,
      node: process.versions.node,
      adbPath: adb.getAdbPath(),
      adbVersion,
      adapters,
      downloadDirectory: ctx.getSettings().downloadDirectory,
      pluginDirectory: ctx.paths.userPlugins,
    };
  });
}
