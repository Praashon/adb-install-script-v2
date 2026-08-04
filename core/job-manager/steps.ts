import { join, extname, basename } from "path";
import { existsSync, mkdirSync, statSync } from "fs";
import AdmZip from "adm-zip";
import { rm, open } from "fs/promises";
import { EventBus } from "@core/event-bus/eventBus";
import { JobRepository } from "@core/database/repositories/jobRepository";
import { SourceRepository } from "@core/database/repositories/sourceRepository";
import { AdapterRepository } from "@core/database/repositories/adapterRepository";
import { DownloadRepository } from "@core/database/repositories/downloadRepository";
import { DeviceRepository } from "@core/database/repositories/deviceRepository";
import { InstalledAppRepository } from "@core/database/repositories/installedAppRepository";
import { SourceDetector } from "@source-engine/sourceDetector";
import { Parser } from "@source-engine/parser";
import { AdapterManager } from "@source-engine/adapterManager";
import { FailureTracker } from "@adapter-monitor/failureTracker";
import { Downloader } from "@download-engine/downloader";
import { DownloadVerifier } from "@download-engine/verifier";
import { BrowserDownloadStrategy } from "@download-engine/strategies";
import { PackageDetector } from "@apk-engine/packageDetector";
import { ApkValidator } from "@apk-engine/apkValidator";
import {
  SignatureInspector,
  describeSignature,
} from "@apk-engine/signatureInspector";
import { Extractor } from "@apk-engine/extractor";
import { Fingerprint } from "@apk-engine/fingerprint/fingerprint";
import { PackageType } from "@apk-engine/types";
import { AdbManager } from "@adb-engine/adbManager";
import { Installer } from "@adb-engine/installer";
import { Verifier } from "@adb-engine/verifier";
import { JobRunner } from "./jobRunner";
import { JobContext, StepHelpers, NonRetryableError } from "./jobTypes";
import { classifyApkResponse } from "./probeClassify";
export interface JobSettings {
  adbPath: string;
  downloadDirectory: string;
  browserEnabled: boolean;
  browserAssisted: boolean;
  allowDowngrade: boolean;
  grantPermissions: boolean;
  launchAfterInstall: boolean;
}
export interface JobStepDeps {
  eventBus: EventBus;
  jobRepo: JobRepository;
  sourceRepo: SourceRepository;
  adapterRepo: AdapterRepository;
  downloadRepo: DownloadRepository;
  deviceRepo: DeviceRepository;
  installedAppRepo: InstalledAppRepository;
  adapterManager: AdapterManager;
  failureTracker: FailureTracker;
  getSettings(): JobSettings;
  workDir: string;
}
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
function browserHeaders(referer?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-User": "?1",
    "sec-ch-ua":
      '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
  };
  if (referer) {
    headers.Referer = referer;
    headers.Origin = originOf(referer);
    headers["Sec-Fetch-Site"] = "same-origin";
  } else {
    headers["Sec-Fetch-Site"] = "none";
  }
  return headers;
}
function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}
function isBotBlock(message: string): boolean {
  return /HTTP (401|403|405|406|429|503)/.test(message);
}
const MAX_RESOLVE_HOPS = 4;
export function registerJobSteps(runner: JobRunner, deps: JobStepDeps): void {
  runner.registerStep("detect_source", (ctx, helpers) =>
    detectSource(ctx, helpers, deps),
  );
  runner.registerStep("resolve_download", (ctx, helpers) =>
    resolveDownload(ctx, helpers, deps),
  );
  runner.registerStep("download_file", (ctx, helpers) =>
    downloadFile(ctx, helpers, deps),
  );
  runner.registerStep("validate_package", (ctx, helpers) =>
    validatePackage(ctx, helpers, deps),
  );
  runner.registerStep("extract_package", (ctx, helpers) =>
    extractPackage(ctx, helpers, deps),
  );
  runner.registerStep("install_apk", (ctx, helpers) =>
    installApk(ctx, helpers, deps),
  );
  runner.registerStep("verify_installation", (ctx, helpers) =>
    verifyInstallation(ctx, helpers, deps),
  );
}
async function detectSource(
  ctx: JobContext,
  helpers: StepHelpers,
  deps: JobStepDeps,
): Promise<JobContext> {
  const detector = new SourceDetector(deps.sourceRepo, deps.adapterRepo);
  const result = await detector.detect(ctx.url);
  helpers.setStepProgress(0.5);
  if (result.type === "known_source" && result.sourceId) {
    deps.jobRepo.setSourceId(ctx.jobId, result.sourceId);
    helpers.log(
      "info",
      `Recognised source: ${result.sourceName} (${result.confidence}% confidence)`,
    );
  } else if (result.type === "direct_apk") {
    helpers.log("info", "Direct APK link detected");
  } else {
    helpers.log(
      "warn",
      `No adapter registered for ${result.domain || "this site"}, falling back to generic extraction`,
    );
  }
  helpers.setStepProgress(1);
  return {
    ...ctx,
    sourceId: result.sourceId ?? ctx.sourceId,
    sourceName: result.sourceName,
    domain: result.domain,
    detectionType: result.type,
  };
}
interface ProbeResult {
  finalUrl: string;
  isApk: boolean;
  isHtml: boolean;
  filename?: string;
  fileSize?: number;
  mimeType?: string;
}
async function resolveDownload(
  ctx: JobContext,
  helpers: StepHelpers,
  deps: JobStepDeps,
): Promise<JobContext> {
  const settings = deps.getSettings();
  const loaded = ctx.domain
    ? deps.adapterManager.getAdapter(ctx.domain)
    : undefined;
  const adapter = loaded?.sandboxed ?? deps.adapterManager.getFallbackAdapter();
  const parser = new Parser();
  const visited = new Set<string>([ctx.url]);
  let current = ctx.url;
  let referer: string | undefined;
  let blockedReason: string | null = null;
  for (let hop = 0; hop < MAX_RESOLVE_HOPS; hop++) {
    helpers.throwIfAborted();
    helpers.setStepProgress((hop + 1) / (MAX_RESOLVE_HOPS + 2));
    const headers = { ...browserHeaders(referer), ...adapter.getAllHeaders() };
    const probe = await probeUrl(current, headers, helpers.signal);
    if (probe.isApk) {
      helpers.log(
        "info",
        `Resolved download: ${probe.filename ?? probe.finalUrl}`,
      );
      return {
        ...ctx,
        downloadUrl: probe.finalUrl,
        filename: probe.filename ?? filenameFromUrl(probe.finalUrl),
        fileSize: probe.fileSize,
        downloadHeaders: headers,
        strategy: hop === 0 ? "direct" : "html",
      };
    }
    let html: string;
    try {
      html = await fetchText(current, headers, helpers.signal);
    } catch (error) {
      helpers.throwIfAborted();
      blockedReason =
        error instanceof Error ? error.message : "Page request failed";
      helpers.log("warn", `${current} could not be read: ${blockedReason}`);
      break;
    }
    const parsed = await parser.parseDownloadPage(html, current, adapter);
    if (!parsed) {
      helpers.log("warn", `No download link found on ${current}`);
      break;
    }
    if (visited.has(parsed.downloadUrl)) {
      helpers.log("warn", "Download link loops back to a page already visited");
      break;
    }
    helpers.log("debug", `Following link: ${parsed.downloadUrl}`);
    visited.add(parsed.downloadUrl);
    referer = current;
    current = parsed.downloadUrl;
  }
  if (settings.browserEnabled) {
    helpers.log(
      "info",
      blockedReason && isBotBlock(blockedReason)
        ? "The site blocked a direct request, retrying with the browser engine"
        : "Static extraction found nothing, trying the browser engine",
    );
    helpers.setStepProgress(0.85);
    if (settings.browserAssisted) {
      helpers.log(
        "info",
        "A browser window will open, complete any site check there",
      );
    }
    const browserStrategy = new BrowserDownloadStrategy(deps.eventBus);
    let result;
    try {
      result = await browserStrategy.resolve(ctx.url, adapter, {
        headed: settings.browserAssisted,
      });
    } catch (error) {
      helpers.throwIfAborted();
      if (
        error instanceof Error &&
        error.name === "HumanVerificationRequiredError"
      ) {
        throw new NonRetryableError(
          'This site is behind an anti-bot service that refuses automated browsers. Open the page in your normal browser, download the APK there, then use "Install from file" on the dashboard.',
        );
      }
      throw new NonRetryableError(
        error instanceof Error ? error.message : "Browser engine failed",
      );
    }
    if (result) {
      helpers.setStepProgress(1);
      helpers.log("info", `Browser engine resolved: ${result.filename}`);
      return {
        ...ctx,
        downloadUrl: result.url,
        filename: result.filename,
        downloadHeaders: { ...browserHeaders(ctx.url), ...result.headers },
        strategy: "browser",
      };
    }
  }
  throw new NonRetryableError(
    buildResolveFailureMessage(blockedReason, settings.browserEnabled),
  );
}
function buildResolveFailureMessage(
  blockedReason: string | null,
  browserEnabled: boolean,
): string {
  if (blockedReason && isBotBlock(blockedReason)) {
    return browserEnabled
      ? `The site blocked automated access (${blockedReason}) and the browser could not get through, so it is behind an anti-bot service like Cloudflare. Open the page in your normal browser, download the APK, then use Install from file on the dashboard.`
      : `The site blocked automated access (${blockedReason}). Turn on the browser fallback and assisted browser mode in Settings, or download the APK in your normal browser and use Install from file.`;
  }
  if (blockedReason) {
    return `Could not load the page: ${blockedReason}`;
  }
  return browserEnabled
    ? "No APK download link was found on this page. The site layout may have changed, check the adapter selectors under Sources."
    : "No APK download link was found on this page. Enable the browser fallback engine in Settings to handle JavaScript-driven sites.";
}
async function probeUrl(
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<ProbeResult> {
  let response: Response | null = null;
  try {
    response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers,
      signal,
    });
  } catch {
    response = null;
  }
  const headWasUseless =
    !response || !response.ok || !response.headers.get("content-type");
  if (headWasUseless) {
    try {
      response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: { ...headers, Range: "bytes=0-0" },
        signal,
      });
      await response.body?.cancel().catch(() => {});
    } catch {
      if (!response) return { finalUrl: url, isApk: false, isHtml: true };
    }
  }
  if (!response) return { finalUrl: url, isApk: false, isHtml: true };
  const mimeType = (response.headers.get("content-type") || "").toLowerCase();
  const disposition = response.headers.get("content-disposition") || "";
  const finalUrl = response.url || url;
  const dispositionName = parseDispositionFilename(disposition);
  const urlName = filenameFromUrlOrNull(finalUrl);
  const candidateName = dispositionName ?? urlName;

  const { isApk, isHtml } = classifyApkResponse({
    mimeType,
    candidateName: candidateName ?? null,
    pathname: pathnameOf(finalUrl),
    hasDisposition: Boolean(dispositionName),
  });

  const contentRange = response.headers.get("content-range");
  const rawLength = contentRange
    ? contentRange.split("/")[1]
    : response.headers.get("content-length");
  const fileSize =
    rawLength && /^\d+$/.test(rawLength) ? parseInt(rawLength, 10) : undefined;

  return {
    finalUrl,
    isApk,
    isHtml,
    filename: isApk ? (candidateName ?? filenameFromUrl(finalUrl)) : undefined,
    fileSize,
    mimeType,
  };
}
async function fetchText(
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch(url, {
    headers: {
      ...headers,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    redirect: "follow",
    signal,
  });
  if (!response.ok) {
    throw new Error(
      `Page request failed: HTTP ${response.status} ${response.statusText}`,
    );
  }
  return response.text();
}
async function downloadFile(
  ctx: JobContext,
  helpers: StepHelpers,
  deps: JobStepDeps,
): Promise<JobContext> {
  if (!ctx.downloadUrl) {
    throw new Error("No download URL was resolved");
  }
  const settings = deps.getSettings();
  const targetDir = settings.downloadDirectory;
  mkdirSync(targetDir, { recursive: true });
  const filename = uniqueFilename(
    targetDir,
    sanitizeFilename(ctx.filename ?? "download.apk"),
  );
  const outputPath = join(targetDir, filename);
  const downloadId =
    ctx.downloadId ??
    deps.downloadRepo.create({
      jobId: ctx.jobId,
      sourceId: ctx.sourceId,
      url: ctx.downloadUrl,
      filename,
      filePath: outputPath,
      fileSize: ctx.fileSize,
    });
  const downloader = new Downloader(deps.eventBus);
  const downloadHeaders: Record<string, string> = {
    ...ctx.downloadHeaders,
    Accept: "*/*",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
  };
  delete downloadHeaders["Upgrade-Insecure-Requests"];
  delete downloadHeaders["Sec-Fetch-User"];
  try {
    const result = await downloader.download({
      url: ctx.downloadUrl,
      outputPath,
      headers: downloadHeaders,
      jobId: ctx.jobId,
      signal: helpers.signal,
      onProgress: (downloaded, total) => {
        if (total && total > 0) {
          helpers.setStepProgress(downloaded / total);
        }
      },
    });
    helpers.setStepProgress(1);
    helpers.log(
      "info",
      `Downloaded ${formatBytes(result.fileSize)} to ${filename}`,
    );
    return {
      ...ctx,
      downloadId,
      downloadPath: result.filePath,
      filename,
      fileSize: result.fileSize,
    };
  } catch (error) {
    deps.downloadRepo.setFailed(downloadId);
    throw error;
  }
}
async function assertLooksLikePackage(filePath: string): Promise<void> {
  const handle = await open(filePath, "r");
  try {
    const { buffer, bytesRead } = await handle.read(
      Buffer.alloc(64),
      0,
      64,
      0,
    );
    const head = buffer.subarray(0, bytesRead);
    if (head.length >= 2 && head[0] === 0x50 && head[1] === 0x4b) return;

    const text = head.toString("utf8").trimStart().toLowerCase();
    if (text.startsWith("<") || text.includes("<html")) {
      throw new NonRetryableError(
        "The download was an HTML page, not an APK. The site served a block or login page instead of the file. Download it in your normal browser, then use Install from file on the dashboard.",
      );
    }
    throw new NonRetryableError(
      "The download is not an Android package. The link resolved to the wrong file. Try Install from file with a package you downloaded manually.",
    );
  } finally {
    await handle.close();
  }
}
async function validatePackage(
  ctx: JobContext,
  helpers: StepHelpers,
  deps: JobStepDeps,
): Promise<JobContext> {
  if (!ctx.downloadPath) {
    throw new Error("No downloaded file to validate");
  }
  await assertLooksLikePackage(ctx.downloadPath);
  const detector = new PackageDetector();
  const packageType = detector.detect(ctx.downloadPath);
  helpers.log("info", `Package type: ${packageType}`);
  helpers.setStepProgress(0.3);
  if (packageType === "apk") {
    const validator = new ApkValidator();
    const result = validator.validate(ctx.downloadPath);
    if (!result.valid) {
      throw new NonRetryableError(
        `Not a valid APK, ${result.errors.join("; ")}`,
      );
    }
  }
  helpers.setStepProgress(0.6);
  const verifier = new DownloadVerifier(deps.downloadRepo);
  const verification = await verifier.verify(
    ctx.downloadPath,
    undefined,
    undefined,
  );
  if (!verification.valid) {
    throw new Error(verification.errors.join("; "));
  }
  if (verification.isDuplicate) {
    helpers.log(
      "info",
      "This exact file has been downloaded before (matching SHA-256)",
    );
  }
  if (ctx.downloadId) {
    deps.downloadRepo.updateFile(ctx.downloadId, {
      filePath: ctx.downloadPath,
      fileSize: verification.fileSize,
      sha256: verification.sha256,
      packageType,
    });
  }
  helpers.setStepProgress(1);
  return {
    ...ctx,
    packageType,
    sha256: verification.sha256,
    fileSize: verification.fileSize,
  };
}
async function extractPackage(
  ctx: JobContext,
  helpers: StepHelpers,
  deps: JobStepDeps,
): Promise<JobContext> {
  if (!ctx.downloadPath) {
    throw new Error("No downloaded file to extract");
  }
  const packageType = (ctx.packageType ?? "apk") as PackageType;
  const outputDir = join(deps.workDir, ctx.jobId);
  const extractor = new Extractor();
  const info = await extractor.extract(
    ctx.downloadPath,
    packageType,
    outputDir,
  );
  helpers.setStepProgress(0.5);
  if (info.apkFiles.length === 0) {
    throw new Error("No installable APK files were found inside the package");
  }
  helpers.log(
    "info",
    info.apkFiles.length > 1
      ? `Extracted ${info.apkFiles.length} split APKs${info.obbFiles.length ? ` and ${info.obbFiles.length} OBB file(s)` : ""}`
      : "Package ready to install",
  );
  const fingerprint = new Fingerprint();
  const identity = await fingerprint
    .generate(info.apkFiles[0])
    .catch(() => null);
  const packageName =
    info.packageName ??
    (identity?.packageName && identity.packageName !== "unknown"
      ? identity.packageName
      : undefined);
  if (packageName) {
    helpers.log(
      "info",
      `Package: ${packageName}${identity?.versionName ? ` v${identity.versionName}` : ""}`,
    );
  }
  if (ctx.downloadId && packageName) {
    deps.downloadRepo.updateMetadata(ctx.downloadId, {
      packageName,
      versionName: info.versionName ?? identity?.versionName,
    });
  }
  helpers.setStepProgress(1);
  return {
    ...ctx,
    apkFiles: info.apkFiles,
    obbFiles: info.obbFiles,
    packageName,
    versionName: info.versionName ?? identity?.versionName,
    versionCode: info.versionCode ?? identity?.versionCode,
    architecture: identity?.architecture,
    certificate: identity?.certificate,
  };
}
async function installApk(
  ctx: JobContext,
  helpers: StepHelpers,
  deps: JobStepDeps,
): Promise<JobContext> {
  const apkFiles = ctx.apkFiles ?? [];
  if (apkFiles.length === 0) {
    throw new Error("No APK files to install");
  }
  const settings = deps.getSettings();
  const adb = new AdbManager(settings.adbPath);
  const device = await selectDevice(ctx, adb, deps);
  helpers.log("info", `Installing to ${device.model || device.serial}`);
  helpers.setStepProgress(0.15);
  reportSignatures(apkFiles, helpers);
  const installer = new Installer(deps.eventBus, adb.getAdbPath());
  const options = {
    serial: device.serial,
    signal: helpers.signal,
    allowDowngrade: settings.allowDowngrade,
    grantPermissions: settings.grantPermissions,
  };
  const result =
    apkFiles.length > 1
      ? await installer.installMultiple(apkFiles, options)
      : await installer.installSingle(apkFiles[0], options);
  if (!result.success) {
    const message = result.error ?? "Installation failed";
    if (ctx.sourceId) {
      deps.failureTracker.recordFailure(ctx.sourceId, message);
    }
    if (result.permanent) {
      throw new NonRetryableError(
        withSignatureHint(message, result.errorCode, apkFiles),
      );
    }
    throw new Error(message);
  }
  helpers.setStepProgress(0.7);
  const obbFiles = ctx.obbFiles ?? [];
  if (obbFiles.length > 0 && ctx.packageName) {
    for (let i = 0; i < obbFiles.length; i++) {
      helpers.throwIfAborted();
      const pushed = await installer.pushObb(
        obbFiles[i],
        ctx.packageName,
        options,
      );
      if (!pushed) {
        helpers.log(
          "warn",
          `Failed to push ${basename(obbFiles[i])}, the app may not run correctly`,
        );
      }
      helpers.setStepProgress(0.7 + (0.3 * (i + 1)) / obbFiles.length);
    }
  }
  helpers.setStepProgress(1);
  helpers.log("info", `Installed in ${(result.duration / 1000).toFixed(1)}s`);
  const deviceRow = deps.deviceRepo.findBySerial(device.serial);
  return {
    ...ctx,
    deviceSerial: device.serial,
    deviceId: deviceRow?.id ?? ctx.deviceId,
  };
}
function reportSignatures(apkFiles: string[], helpers: StepHelpers): void {
  const inspector = new SignatureInspector();
  for (const file of apkFiles) {
    let info;
    try {
      const zip = new AdmZip(file);
      info = inspector.inspect(
        file,
        zip.getEntries().map((e) => e.entryName),
      );
    } catch {
      helpers.log(
        "warn",
        `${basename(file)} could not be opened as a zip archive, the file is probably truncated`,
      );
      continue;
    }
    if (info.signed) {
      helpers.log(
        "info",
        `${basename(file)} is signed (${describeSignature(info)})`,
      );
    } else {
      helpers.log(
        "warn",
        `${basename(file)} carries no signature (no v1 JAR signature and no APK Signing Block). Android will refuse to install it. This normally means the download is incomplete or the package was repacked without being re-signed.`,
      );
    }
  }
}
function withSignatureHint(
  message: string,
  errorCode: string | undefined,
  apkFiles: string[],
): string {
  if (errorCode !== "INSTALL_PARSE_FAILED_NO_CERTIFICATES") return message;
  const sizes = apkFiles
    .map((file) => {
      try {
        return `${basename(file)} is ${formatBytes(statSync(file).size)}`;
      } catch {
        return `${basename(file)} is unreadable`;
      }
    })
    .join(", ");
  return `${message} Checked file: ${sizes}. If that size looks smaller than the real app, the download was truncated, so fetch the package again or use Install from file.`;
}
async function selectDevice(
  ctx: JobContext,
  adb: AdbManager,
  deps: JobStepDeps,
): Promise<{
  serial: string;
  model: string;
}> {
  const devices = await adb.listDevices();
  if (devices.length === 0) {
    throw new NonRetryableError(
      "No device connected. Plug in an Android device with USB debugging enabled, then retry.",
    );
  }
  for (const device of devices) {
    deps.deviceRepo.upsert({
      serial: device.serial,
      model: device.model,
      manufacturer: device.manufacturer,
      androidVersion: device.androidVersion,
      architecture: device.architecture,
      status: device.status,
    });
  }
  const requestedSerial =
    ctx.deviceSerial ??
    (ctx.deviceId
      ? deps.deviceRepo.findById(ctx.deviceId)?.serial
      : undefined) ??
    deps.deviceRepo.findPreferred()?.serial;
  const online = devices.filter((d) => d.status === "online");
  if (requestedSerial) {
    const match = devices.find((d) => d.serial === requestedSerial);
    if (!match) {
      throw new Error(`Device ${requestedSerial} is no longer connected`);
    }
    if (match.status === "unauthorized") {
      throw new NonRetryableError(
        `Device ${match.model || match.serial} is unauthorized. Accept the USB debugging prompt on the device.`,
      );
    }
    if (match.status !== "online") {
      throw new NonRetryableError(
        `Device ${match.model || match.serial} is offline`,
      );
    }
    return { serial: match.serial, model: match.model };
  }
  if (online.length === 0) {
    const unauthorized = devices.find((d) => d.status === "unauthorized");
    throw new NonRetryableError(
      unauthorized
        ? "Device is unauthorized. Accept the USB debugging prompt on the device and retry."
        : "No online device available. Check the USB connection.",
    );
  }
  return { serial: online[0].serial, model: online[0].model };
}
async function verifyInstallation(
  ctx: JobContext,
  helpers: StepHelpers,
  deps: JobStepDeps,
): Promise<JobContext> {
  const settings = deps.getSettings();
  const adb = new AdbManager(settings.adbPath);
  const verifier = new Verifier(adb.getAdbPath());
  if (!ctx.packageName) {
    helpers.log(
      "warn",
      "Package name could not be read from the APK, skipping post-install verification",
    );
    await cleanupWorkDir(deps.workDir, ctx.jobId);
    return ctx;
  }
  const result = await verifier.verifyInstallation(
    ctx.packageName,
    ctx.deviceSerial,
  );
  helpers.setStepProgress(0.6);
  if (!result.installed) {
    throw new Error(
      result.error ?? "The package is not present on the device after install",
    );
  }
  helpers.log(
    "info",
    `Verified ${result.packageName}${result.versionName ? ` v${result.versionName}` : ""} on device`,
  );
  const deviceRow = ctx.deviceSerial
    ? deps.deviceRepo.findBySerial(ctx.deviceSerial)
    : undefined;
  const installedAppId = deps.installedAppRepo.record({
    packageName: result.packageName,
    versionName: result.versionName ?? ctx.versionName,
    versionCode: result.versionCode ?? ctx.versionCode,
    sha256: ctx.sha256,
    certificate: ctx.certificate,
    architecture: ctx.architecture,
    deviceId: deviceRow?.id,
    sourceId: ctx.sourceId,
    downloadId: ctx.downloadId,
  });
  if (ctx.sourceId) {
    deps.failureTracker.recordSuccess(ctx.sourceId);
  }
  if (settings.launchAfterInstall) {
    const launched = await verifier.launchApp(
      result.packageName,
      ctx.deviceSerial,
    );
    helpers.log(
      launched ? "info" : "warn",
      launched ? "App launched on device" : "Could not launch the app",
    );
  }
  await cleanupWorkDir(deps.workDir, ctx.jobId);
  helpers.setStepProgress(1);
  return {
    ...ctx,
    installedAppId,
    versionName: result.versionName ?? ctx.versionName,
  };
}
async function cleanupWorkDir(workDir: string, jobId: string): Promise<void> {
  await rm(join(workDir, jobId), { recursive: true, force: true }).catch(
    () => {},
  );
}
export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[/\\]/g, "_")
    .replace(/[\x00-\x1f<>:"|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const safe = cleaned.length > 0 ? cleaned : "download.apk";
  const withExtension = extname(safe) ? safe : `${safe}.apk`;
  return withExtension.length > 180 ? withExtension.slice(-180) : withExtension;
}
function uniqueFilename(dir: string, filename: string): string {
  if (!existsSync(join(dir, filename))) return filename;
  const ext = extname(filename);
  const stem = filename.slice(0, filename.length - ext.length);
  for (let i = 1; i < 1000; i++) {
    const candidate = `${stem} (${i})${ext}`;
    if (!existsSync(join(dir, candidate))) return candidate;
  }
  return `${stem}-${Date.now()}${ext}`;
}
function parseDispositionFilename(disposition: string): string | undefined {
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;\n]+)/i);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {
      return utf8Match[1].trim();
    }
  }
  const plainMatch = disposition.match(/filename=("?)([^";\n]+)\1/i);
  return plainMatch ? plainMatch[2].trim() : undefined;
}
function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}
function filenameFromUrlOrNull(url: string): string | undefined {
  try {
    const segments = new URL(url).pathname.split("/");
    const last = segments[segments.length - 1];
    if (last && last.includes(".")) return decodeURIComponent(last);
  } catch {}
  return undefined;
}
function filenameFromUrl(url: string): string {
  return filenameFromUrlOrNull(url) ?? "download.apk";
}
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}
