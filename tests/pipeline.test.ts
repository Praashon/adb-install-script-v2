import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, Server } from "http";
import { AddressInfo } from "net";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { randomBytes } from "crypto";
import { tmpdir } from "os";
import { join } from "path";
import AdmZip from "adm-zip";

import { Parser } from "@source-engine/parser";
import { AdapterSandbox } from "@security-engine/sandbox";
import { AdapterValidator } from "@security-engine/adapterValidator";
import { WebsiteAnalyzer } from "@source-engine/websiteAnalyzer";
import { Downloader } from "@download-engine/downloader";
import { PackageDetector } from "@apk-engine/packageDetector";
import { ApkValidator } from "@apk-engine/apkValidator";
import { Extractor } from "@apk-engine/extractor";
import { EventBus } from "@core/event-bus/eventBus";
import { describePackageFailure } from "@adb-engine/adbManager";

/**
 * Builds a zip that passes APK validation: manifest + dex + resources.
 * The padding is random so the archive stays above the validator's 1 KB
 * floor instead of compressing away to nothing.
 */
function buildFakeApk(packageName = "com.example.demo"): Buffer {
  const zip = new AdmZip();
  zip.addFile(
    "AndroidManifest.xml",
    Buffer.concat([
      Buffer.from(`  package ${packageName} `),
      randomBytes(2048),
    ]),
  );
  zip.addFile(
    "classes.dex",
    Buffer.concat([Buffer.from("dex 035 "), randomBytes(2048)]),
  );
  zip.addFile("resources.arsc", randomBytes(1024));
  return zip.toBuffer();
}

const DOWNLOAD_PAGE = `<!doctype html>
<html><head><title>Demo App 1.0</title></head>
<body>
  <h1>Demo App</h1>
  <a class="nope" href="/about">About us</a>
  <a class="downloadButton" href="/files/demo-app-1.0.apk">Download APK</a>
</body></html>`;

describe("APK acquisition pipeline", () => {
  let server: Server;
  let baseUrl: string;
  let workDir: string;

  beforeAll(async () => {
    const apk = buildFakeApk();

    server = createServer((req, res) => {
      if (req.url === "/app.html") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(DOWNLOAD_PAGE);
        return;
      }

      if (req.url === "/files/demo-app-1.0.apk") {
        res.writeHead(200, {
          "content-type": "application/vnd.android.package-archive",
          "content-disposition": 'attachment; filename="demo-app-1.0.apk"',
          "content-length": String(apk.length),
        });
        res.end(apk);
        return;
      }

      if (req.url === "/blocked.html") {
        res.writeHead(403, { "content-type": "text/html" });
        res.end("Forbidden");
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    workDir = mkdtempSync(join(tmpdir(), "adb-pipeline-"));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(workDir, { recursive: true, force: true });
  });

  it("extracts the download link from a page using adapter selectors", async () => {
    const adapter = new AdapterSandbox().wrap({
      version: 1,
      parserType: "html",
      rules: { downloadLinkSelector: "a.downloadButton" },
      downloadStrategy: "html",
    });

    const html = await (await fetch(`${baseUrl}/app.html`)).text();
    const parsed = await new Parser().parseDownloadPage(
      html,
      `${baseUrl}/app.html`,
      adapter,
    );

    expect(parsed).not.toBeNull();
    expect(parsed!.downloadUrl).toBe(`${baseUrl}/files/demo-app-1.0.apk`);
    expect(parsed!.fileType).toBe("apk");
    expect(parsed!.filename).toBe("demo-app-1.0.apk");
  });

  it("falls back to auto-detection when no selector matches", async () => {
    const adapter = new AdapterSandbox().wrap({
      version: 1,
      parserType: "html",
      rules: { downloadLinkSelector: "#does-not-exist" },
      downloadStrategy: "html",
    });

    const html = await (await fetch(`${baseUrl}/app.html`)).text();
    const parsed = await new Parser().parseDownloadPage(
      html,
      `${baseUrl}/app.html`,
      adapter,
    );

    expect(parsed?.downloadUrl).toBe(`${baseUrl}/files/demo-app-1.0.apk`);
  });

  it("downloads, validates, and extracts an APK end to end", async () => {
    const outputPath = join(workDir, "demo-app-1.0.apk");
    const downloader = new Downloader(new EventBus());

    const progressSamples: number[] = [];
    const result = await downloader.download({
      url: `${baseUrl}/files/demo-app-1.0.apk`,
      outputPath,
      onProgress: (downloaded) => progressSamples.push(downloaded),
    });

    expect(result.fileSize).toBeGreaterThan(1024);
    expect(progressSamples.at(-1)).toBe(result.fileSize);

    expect(new PackageDetector().detect(outputPath)).toBe("apk");

    const validation = new ApkValidator().validate(outputPath);
    expect(validation.valid).toBe(true);
    expect(validation.hasManifest).toBe(true);
    expect(validation.hasDex).toBe(true);

    const info = await new Extractor().extract(
      outputPath,
      "apk",
      join(workDir, "out"),
    );
    expect(info.apkFiles).toEqual([outputPath]);
  });

  it("aborts a download and leaves no partial file behind", async () => {
    const controller = new AbortController();
    controller.abort();

    const outputPath = join(workDir, "aborted.apk");
    const downloader = new Downloader(new EventBus());

    await expect(
      downloader.download({
        url: `${baseUrl}/files/demo-app-1.0.apk`,
        outputPath,
        signal: controller.signal,
      }),
    ).rejects.toThrow();

    expect(new ApkValidator().isValidArchive(outputPath)).toBe(false);
  });

  it("surfaces the HTTP status when a page blocks the request", async () => {
    const downloader = new Downloader(new EventBus());

    await expect(
      downloader.download({
        url: `${baseUrl}/blocked.html`,
        outputPath: join(workDir, "x.apk"),
      }),
    ).rejects.toThrow(/403/);
  });

  it("analyses an unknown site and suggests usable selectors", async () => {
    const analysis = await new WebsiteAnalyzer().analyze(`${baseUrl}/app.html`);

    expect(analysis.confidence).toBeGreaterThan(0);
    expect(analysis.detectedLinks.length).toBeGreaterThan(0);
    expect(analysis.suggestedRules.downloadLinkSelector).toBeTruthy();
  });

  it("sorts split bundles so the base APK installs first", async () => {
    const bundle = new AdmZip();
    bundle.addFile(
      "split_config.arm64_v8a.apk",
      buildFakeApk("com.example.split"),
    );
    bundle.addFile("base.apk", buildFakeApk("com.example.split"));
    const bundlePath = join(workDir, "bundle.apks");
    writeFileSync(bundlePath, bundle.toBuffer());

    const info = await new Extractor().extract(
      bundlePath,
      "apks",
      join(workDir, "bundle-out"),
    );

    expect(info.apkFiles).toHaveLength(2);
    expect(info.apkFiles[0]).toMatch(/base\.apk$/);
  });
});

describe("link ranking on real-world pages", () => {
  const sandbox = new AdapterSandbox();
  const parser = new Parser();

  // Mirrors an APKCombo download page: the page links to itself in a dozen
  // languages, and the actual APK sits behind a CDN redirector.
  const PAGE_URL = "https://apkcombo.com/app/com.bin.manager/download/apk";
  const R2_LINK =
    "/r2?u=https%3A%2F%2Fapks.example.r2.cloudflarestorage.com%2Fcom.bin.manager%2F2.4.0%2F24.abc.apk%3Fresponse-content-disposition%3Dattachment%253B%2520filename%253D%2522BinManager_2.4.0_apkcombo.com.apk%2522";

  const APKCOMBO_PAGE = `<!doctype html><html><body>
    <a href="/app/com.bin.manager/download/apk">English</a>
    <a href="/pt/app/com.bin.manager/download/apk">Português</a>
    <a href="/es/app/com.bin.manager/download/apk">Español</a>
    <a href="${R2_LINK}">Download APK (26 MB)</a>
    <a href="/apkcombo-installer/com.apkcombo.app/">APKCombo Installer</a>
  </body></html>`;

  it("does not pick the page's own language-switcher link", async () => {
    const adapter = sandbox.wrap({
      version: 1,
      parserType: "html",
      rules: { downloadLinkSelector: "a[href*='/download/']" },
      downloadStrategy: "html",
    });

    const parsed = await parser.parseDownloadPage(
      APKCOMBO_PAGE,
      PAGE_URL,
      adapter,
    );

    expect(parsed).not.toBeNull();
    expect(parsed!.downloadUrl).not.toBe(PAGE_URL);
    expect(parsed!.downloadUrl).toContain("/r2?u=");
  });

  it("prefers a CDN redirector carrying an APK filename over an unrelated app link", async () => {
    const adapter = sandbox.wrap({
      version: 1,
      parserType: "html",
      rules: {},
      downloadStrategy: "html",
    });

    // Auto-detection: `a[href*=".apk"]` also matches "com.apkcombo.app".
    const parsed = await parser.parseDownloadPage(
      APKCOMBO_PAGE,
      PAGE_URL,
      adapter,
    );

    expect(parsed!.downloadUrl).toContain("/r2?u=");
    expect(parsed!.downloadUrl).not.toContain("apkcombo-installer");
  });

  it("still prefers a plain .apk link when one is present", async () => {
    const page = `<html><body>
      <a href="/some/page/download/">Download page</a>
      <a href="/files/app-1.2.3.apk">Get APK</a>
    </body></html>`;

    const adapter = sandbox.wrap({
      version: 1,
      parserType: "html",
      rules: {},
      downloadStrategy: "html",
    });

    const parsed = await parser.parseDownloadPage(
      page,
      "https://example.com/app",
      adapter,
    );
    expect(parsed!.downloadUrl).toBe("https://example.com/files/app-1.2.3.apk");
  });
});

describe("pm failure messages", () => {
  // Captured verbatim from a vivo V2348 running Android 16.
  const VIVO_DISABLE_OUTPUT = [
    "Exception occurred while executing 'disable-user':",
    "java.lang.SecurityException: Cannot disable com.vivo.weather.provider no root permission",
    "\tat com.android.server.pm.PackageManagerService.setEnabledSettingInternalLocked(PackageManagerService.java:4695)",
    "\tat com.android.server.pm.PackageManagerService.setEnabledSettings(PackageManagerService.java:4590)",
  ].join("\n");

  it('never reports the useless "Exception occurred" preamble alone', () => {
    const message = describePackageFailure(VIVO_DISABLE_OUTPUT);

    expect(message).not.toMatch(/^Exception occurred/);
    expect(message.trim().endsWith(":")).toBe(false);
  });

  it("explains that a vendor-locked package needs root, including for Shizuku", () => {
    const message = describePackageFailure(VIVO_DISABLE_OUTPUT);

    expect(message).toMatch(/root/i);
    expect(message).toMatch(/Shizuku/i);
  });

  it("maps uninstall failure codes to plain language", () => {
    expect(
      describePackageFailure("Failure [DELETE_FAILED_USER_RESTRICTED]"),
    ).toMatch(/manufacturer software refuses/i);
    expect(
      describePackageFailure("Failure [DELETE_FAILED_INTERNAL_ERROR]"),
    ).toMatch(/system image/i);
    expect(describePackageFailure("Failure [-1000]")).toBe("-1000");
  });

  it("falls back to the thrown cause for unrecognised exceptions", () => {
    const output = [
      "Exception occurred while executing 'install':",
      "java.lang.IllegalStateException: Something specific went wrong",
      "\tat com.android.server.pm.Whatever(Whatever.java:1)",
    ].join("\n");

    expect(describePackageFailure(output)).toBe(
      "Something specific went wrong",
    );
  });

  it("never returns an empty message", () => {
    expect(describePackageFailure("")).toBeTruthy();
    expect(describePackageFailure("   \n  \n")).toBeTruthy();
  });
});

describe("adapter sandbox", () => {
  const validator = new AdapterValidator();

  it("accepts a plain selector-based adapter", () => {
    const result = validator.validateAdapterRules({
      version: 1,
      parserType: "html",
      rules: { downloadLinkSelector: "a[href$='.apk']" },
      downloadStrategy: "html",
    });

    expect(result.valid).toBe(true);
  });

  it("rejects adapters that smuggle in executable content", () => {
    const result = validator.validateAdapterRules({
      version: 1,
      parserType: "html",
      rules: { downloadLinkSelector: "a[onclick='eval(atob(x))']" },
      downloadStrategy: "html",
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/Blocked pattern/);
  });

  it("rejects unknown top-level keys", () => {
    const result = validator.validateAdapterRules({
      version: 1,
      parserType: "html",
      rules: {},
      downloadStrategy: "html",
      postInstallScript: "rm -rf /",
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/postInstallScript/);
  });

  it("strips blocked values at read time even if they reach the sandbox", () => {
    const adapter = new AdapterSandbox().wrap({
      version: 1,
      parserType: "html",
      rules: { downloadLinkSelector: "javascript:alert(1)" },
      downloadStrategy: "html",
    });

    expect(adapter.getSelector("downloadLinkSelector")).toBeUndefined();
  });

  it("clamps out-of-range timeouts", () => {
    const adapter = new AdapterSandbox().wrap({
      version: 1,
      parserType: "html",
      rules: {},
      downloadStrategy: "html",
      metadata: { timeout: 999999 },
    });

    expect(adapter.getTimeout()).toBe(120000);
  });
});
