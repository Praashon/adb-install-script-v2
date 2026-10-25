import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, existsSync, readdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createHash } from "crypto";
import AdmZip from "adm-zip";
import { isPublicAddress, publicHttpUrl, safeFetch, limitedText, publicLookup } from "../security-engine/network";
import { Downloader } from "../download-engine/downloader";
import { EventBus } from "../core/event-bus/eventBus";
import { analyzeApkFile } from "../apk-engine/apkAnalyzer";
import { installationWarnings } from "../apk-engine/compatibility";
import { parseSignerDigests } from "../apk-engine/signature";
import { extractManifestInfo } from "../apk-engine/manifest/axml";

const dirs: string[] = [];
afterEach(() => { vi.unstubAllGlobals(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function temp() { const dir = mkdtempSync(join(tmpdir(), "adb-analysis-")); dirs.push(dir); return dir; }
describe("public network policy", () => {
  it.each(["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1", "2001:db8::1", "2001:0db8::1", "2002:7f00:1::"])("blocks %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });
  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])("allows public address %s", (address) => expect(isPublicAddress(address)).toBe(true));
  it.each(["http://2130706433/", "http://0x7f000001/", "http://[::ffff:127.0.0.1]/", "http://localhost/a", "http://machine.local/a", "file:///a.apk", "https://user:pass@example.com/a"])("blocks URL %s", (url) => expect(() => publicHttpUrl(url)).toThrow());
  it("refuses private addresses returned by the actual connection resolver", async () => {
    const result = await new Promise<Error | null>((resolve) => publicLookup("localhost", { all: true }, (error) => resolve(error)));
    expect(result?.message).toMatch(/non-public/);
  });
  it("checks redirect destinations before any second request", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(safeFetch("https://example.com/a")).rejects.toThrow(/public/);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("strips credentials on cross-origin redirects", async () => {
    const seen: Headers[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: URL, init: RequestInit) => {
      seen.push(new Headers(init.headers));
      return seen.length === 1 ? new Response(null, { status: 302, headers: { location: "https://other.example/a" } }) : new Response("ok");
    }));
    await safeFetch("https://example.com", { headers: { Authorization: "synthetic", Cookie: "synthetic" } });
    expect(seen[0].has("authorization")).toBe(true);
    expect(seen[1].has("authorization")).toBe(false);
    expect(seen[1].has("cookie")).toBe(false);
  });
  it("limits decompressed HTML even without Content-Length", async () => {
    await expect(limitedText(new Response("123456"), 5)).rejects.toThrow(/limit/);
  });
});
describe("download publication", () => {
  it("removes partial files after a streaming size-limit failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("too-large")));
    const dir = temp(); const target = join(dir, "package.apk");
    await expect(new Downloader(new EventBus()).download({ url: "https://example.com/app.apk", outputPath: target, maxBytes: 3 })).rejects.toThrow(/limit/);
    expect(existsSync(target)).toBe(false);
    expect(readdirSync(dir)).toEqual([]);
  });
  it("preserves an existing destination rather than overwriting it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("new")));
    const dir = temp(); const target = join(dir, "package.apk"); writeFileSync(target, "old");
    await expect(new Downloader(new EventBus()).download({ url: "https://example.com/app.apk", outputPath: target })).rejects.toThrow();
    expect(readdirSync(dir)).toEqual(["package.apk"]);
  });
  it("rejects an already-aborted transfer", async () => {
    const signal = AbortSignal.abort();
    vi.stubGlobal("fetch", vi.fn(async () => { signal.throwIfAborted(); return new Response("unused"); }));
    await expect(new Downloader(new EventBus()).download({ url: "https://example.com/app.apk", outputPath: join(temp(), "a.apk"), signal })).rejects.toThrow();
  });
});
describe("offline APK analysis", () => {
  it("hashes the exact file and reports unsupported metadata honestly", async () => {
    const zip = new AdmZip();
    zip.addFile("AndroidManifest.xml", Buffer.from("unsupported manifest"));
    zip.addFile("lib/arm64-v8a/libdemo.so", Buffer.from("fixture"));
    const bytes = zip.toBuffer(); const path = join(temp(), "demo.apk"); writeFileSync(path, bytes);
    const result = await analyzeApkFile(path);
    expect(result.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(result.architectures).toEqual(["arm64-v8a"]);
    expect(result.metadataComplete).toBe(false);
    expect(result.warnings.join(" ")).toMatch(/incomplete/);
  });
  it("blocks incompatible SDKs and ABIs and warns before downgrades", () => {
    const result = installationWarnings({ packageName: "com.example", versionCode: 1, minSdk: 35, targetSdk: 35, architectures: ["arm64-v8a"] }, {
      sdkVersion: "30", supportedAbis: ["x86_64"], installedVersionCode: 2,
    });
    expect(result.blocked).toBe(true); expect(result.warnings).toHaveLength(3);
  });
  it("uses reported ABI lists without assuming 32-bit support on arm64", () => {
    expect(installationWarnings({ packageName: "com.example", versionCode: 1, minSdk: 24, targetSdk: 35, architectures: ["armeabi-v7a"] }, { sdkVersion: "35", supportedAbis: ["arm64-v8a"] }).blocked).toBe(true);
  });
  it("deduplicates actual signer fingerprints from apksigner output", () => {
    const digest = "AB".repeat(32);
    expect(parseSignerDigests(`Signer #1 certificate SHA-256 digest: ${digest}\nSigner #1 certificate SHA-256 digest: ${digest}`)).toEqual([digest.toLowerCase()]);
    expect(parseSignerDigests("META-INF/CERT.RSA: this is not a fingerprint")).toEqual([]);
  });
  it("rejects a manifest with a truncated string-pool chunk", () => {
    const bytes = Buffer.alloc(16); bytes.writeUInt16LE(3); bytes.writeUInt16LE(8, 2); bytes.writeUInt32LE(16, 4); bytes.writeUInt16LE(1, 8); bytes.writeUInt32LE(8, 12);
    expect(() => extractManifestInfo(bytes)).toThrow(/Truncated/);
  });
});
