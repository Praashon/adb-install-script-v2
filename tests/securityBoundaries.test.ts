import { describe, it, expect, vi, afterEach } from "vitest";
import { createConnection, type Server, type AddressInfo } from "net";
import { createRequire } from "module";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createExtensionBridge, validateExtensionRequest, MAX_MESSAGE_BYTES } from "../electron/extensionBridge";
import { isTrustedRendererUrl, externalHttpUrl } from "../electron/rendererTrust";
import { approveDeviceAction } from "../electron/deviceApproval";
import { assertPackageName, assertSerial, validateAdbArguments } from "../adb-engine/arguments";

const require = createRequire(import.meta.url);
const { safeEntryPath, validateEntries, writeEntry } = require("../scripts/safe-archive.cjs");
const { extractVerified } = require("../scripts/fetch-scrcpy.cjs");
const AdmZip = require("adm-zip");
const token = "a".repeat(64);
const servers: Server[] = [];
const directories: string[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});
function temp() { const dir = mkdtempSync(join(tmpdir(), "adb-security-")); directories.push(dir); return dir; }
async function bridge(options: Partial<Parameters<typeof createExtensionBridge>[0]> = {}) {
  const onRequest = vi.fn(async () => ({ success: true }));
  const server = createExtensionBridge({ token, onRequest, ...options });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { onRequest, port: (server.address() as AddressInfo).port };
}
async function request(port: number, chunks: Buffer[]) {
  return new Promise<string>((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let result = "";
    socket.on("error", reject);
    socket.on("data", (chunk) => result += chunk.toString());
    socket.on("close", () => resolve(result));
    socket.on("connect", async () => {
      for (const chunk of chunks) { socket.write(chunk); await new Promise((r) => setTimeout(r, 2)); }
    });
  });
}
describe("extension trust boundary", () => {
  it.each([null, [], {}, { action: "install", url: "https://example.com" }, { token: "wrong", action: "install", url: "https://example.com" }])("rejects unauthenticated input %j", (raw) => {
    expect(() => validateExtensionRequest(raw, token)).toThrow();
  });
  it.each(["file:///C:/a.apk", "javascript:alert(1)", "https://user:pass@example.com/a.apk"])("rejects URL %s", (url) => {
    expect(() => validateExtensionRequest({ token, action: "install", url }, token)).toThrow();
  });
  it("handles fragmented UTF-8 and calls the authorization callback once", async () => {
    const { port, onRequest } = await bridge();
    const frame = Buffer.from(JSON.stringify({ token, action: "install", url: "https://example.com/漢.apk" }) + "\n");
    const response = await request(port, [frame.subarray(0, 10), frame.subarray(10, frame.length - 3), frame.subarray(frame.length - 3)]);
    expect(JSON.parse(response)).toEqual({ success: true });
    expect(onRequest).toHaveBeenCalledOnce();
  });
  it("does not dispatch malformed, oversized or coalesced messages", async () => {
    const { port, onRequest } = await bridge();
    for (const payload of ["null\n", "{bad}\n", "{}\n{}\n", "x".repeat(MAX_MESSAGE_BYTES + 1)]) {
      expect(JSON.parse(await request(port, [Buffer.from(payload)]))).toHaveProperty("error");
    }
    expect(onRequest).not.toHaveBeenCalled();
  });
  it("closes incomplete frames on the absolute deadline", async () => {
    const { port, onRequest } = await bridge({ timeoutMs: 20 });
    expect(await request(port, [Buffer.from("{")])).toBe("");
    expect(onRequest).not.toHaveBeenCalled();
  });
  it("rate limits requests before dispatch", async () => {
    const { port, onRequest } = await bridge({ maxRequests: 1 });
    const payload = Buffer.from(JSON.stringify({ token, action: "install", url: "https://example.com" }) + "\n");
    await request(port, [payload]);
    expect(await request(port, [payload])).toMatch(/limit/);
    expect(onRequest).toHaveBeenCalledOnce();
  });
});
describe("archive safety", () => {
  it.each(["../evil", "/absolute", "C:/evil", "C:evil", "a/../../evil", "a\\..\\evil", "a/file:stream", "a/NUL.txt", "a/file. ", "a//b", "a/./b", "a/../b"])("rejects %s", (path) => {
    expect(() => safeEntryPath(temp(), path)).toThrow();
  });
  it("rejects links, duplicate names, and archive resource exhaustion", () => {
    const dir = temp();
    const entry = { entryName: "a/file", header: { size: 4 }, attr: 0 };
    expect(() => validateEntries([{ ...entry, attr: 0xa000 << 16 }], dir)).toThrow(/links/);
    expect(() => validateEntries([entry, { ...entry, entryName: "A/File" }], dir)).toThrow(/Duplicate/);
    expect(() => validateEntries([entry], dir, { maxBytes: 3 })).toThrow(/limits/);
  });
  it("does not overwrite an existing extraction target", () => {
    const dir = temp(); writeFileSync(join(dir, "file"), "old");
    expect(() => writeEntry(dir, "file", Buffer.from("new"))).toThrow();
  });
  it("extracts a valid synthetic release and rejects an unexpected root", () => {
    const zip = new AdmZip();
    zip.addFile("scrcpy-test/scrcpy.exe", Buffer.from("synthetic"));
    zip.addFile("scrcpy-test/scrcpy-server", Buffer.from("synthetic-server"));
    const dir = temp();
    expect(extractVerified(zip.toBuffer(), dir, "scrcpy-test")).toHaveProperty("scrcpy.exe");
    expect(existsSync(join(dir, "scrcpy.exe"))).toBe(true);
    expect(() => extractVerified(zip.toBuffer(), temp(), "other-root")).toThrow(/directory/);
  });
});
describe("Electron and Android boundaries", () => {
  it("trusts only the exact renderer document and allows hash routes", () => {
    const path = "C:\\app\\index.html";
    expect(isTrustedRendererUrl("file:///C:/app/index.html#/devices", path)).toBe(true);
    expect(isTrustedRendererUrl("file:///C:/app/other.html", path)).toBe(false);
    expect(isTrustedRendererUrl("http://localhost:5173/evil", path, "http://localhost:5173/")).toBe(false);
    expect(() => externalHttpUrl("file:///C:/windows/system32/calc.exe")).toThrow();
  });
  it.each(["com.example;reboot", "com.example$(id)", "-option", "a b", "a\nb"])("rejects hostile package %s", (name) => {
    expect(() => assertPackageName(name)).toThrow();
    if (name !== "-option") expect(() => validateAdbArguments(["-s", "emulator-5554", "shell", "pm", "path", name])).toThrow();
  });
  it("accepts USB and wireless serials but rejects options/control characters", () => {
    for (const serial of ["emulator-5554", "192.168.1.2:5555", "adb-example._adb-tls-connect._tcp"]) expect(() => assertSerial(serial)).not.toThrow();
    for (const serial of ["-s", "a b", "x\nreboot"]) expect(() => assertSerial(serial)).toThrow();
  });
  it("requires explicit approval with the exact device, package, and operation", async () => {
    const prompt = vi.fn(async (_options: Parameters<Parameters<typeof approveDeviceAction>[3]>[0]) => ({ response: 0 }));
    await expect(approveDeviceAction("emulator-5554", "com.example.app", "remove-user", prompt)).rejects.toThrow(/cancelled/);
    expect(prompt.mock.calls[0][0]).toMatchObject({ defaultId: 0, cancelId: 0 });
    expect(prompt.mock.calls[0][0].detail).toContain("emulator-5554");
    expect(prompt.mock.calls[0][0].message).toContain("remove-user: com.example.app");
  });
});
