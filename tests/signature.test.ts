import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { randomBytes } from "crypto";
import { tmpdir } from "os";
import { join } from "path";
import AdmZip from "adm-zip";

import { SignatureInspector } from "@apk-engine/signatureInspector";
import { ApkValidator } from "@apk-engine/apkValidator";

const SIG_BLOCK_MAGIC = "APK Sig Block 42";
const V2_ID = 0x7109871a;
const V3_ID = 0xf05368c0;
const PADDING_ID = 0x42726577;

function baseApkZip(withV1 = false): AdmZip {
  const zip = new AdmZip();
  zip.addFile("AndroidManifest.xml", randomBytes(2048));
  zip.addFile("classes.dex", randomBytes(4096));
  zip.addFile("resources.arsc", randomBytes(1024));
  if (withV1) {
    zip.addFile("META-INF/MANIFEST.MF", Buffer.from("Manifest-Version: 1.0\n"));
    zip.addFile("META-INF/CERT.SF", Buffer.from("Signature-Version: 1.0\n"));
    zip.addFile("META-INF/CERT.RSA", randomBytes(1200));
  }
  return zip;
}

function findEocd(buffer: Buffer): number {
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error("EOCD not found");
}

/**
 * Splices a synthetic APK Signing Block in front of the central directory and
 * repoints the EOCD at its new offset, mirroring how a real signer emits one.
 */
function withSigningBlock(zipBuffer: Buffer, ids: number[]): Buffer {
  const eocd = findEocd(zipBuffer);
  const cdOffset = zipBuffer.readUInt32LE(eocd + 16);

  const pairs = ids.map((id) => {
    const payload = randomBytes(64);
    const pair = Buffer.alloc(8 + 4 + payload.length);
    pair.writeBigUInt64LE(BigInt(4 + payload.length), 0);
    pair.writeUInt32LE(id, 8);
    payload.copy(pair, 12);
    return pair;
  });
  const pairBytes = Buffer.concat(pairs);

  const blockSize = BigInt(pairBytes.length + 8 + 16);
  const head = Buffer.alloc(8);
  head.writeBigUInt64LE(blockSize, 0);
  const tail = Buffer.alloc(8);
  tail.writeBigUInt64LE(blockSize, 0);
  const block = Buffer.concat([
    head,
    pairBytes,
    tail,
    Buffer.from(SIG_BLOCK_MAGIC, "latin1"),
  ]);

  const out = Buffer.concat([
    zipBuffer.subarray(0, cdOffset),
    block,
    zipBuffer.subarray(cdOffset),
  ]);
  out.writeUInt32LE(cdOffset + block.length, findEocd(out) + 16);
  return out;
}

describe("SignatureInspector", () => {
  let workDir: string;
  const inspector = new SignatureInspector();

  const write = (name: string, data: Buffer): string => {
    const path = join(workDir, name);
    writeFileSync(path, data);
    return path;
  };

  const entriesOf = (path: string): string[] =>
    new AdmZip(path).getEntries().map((e) => e.entryName);

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), "sig-test-"));
  });

  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it("reports an APK with no signature material as unsigned", () => {
    const path = write("unsigned.apk", baseApkZip().toBuffer());
    const info = inspector.inspect(path, entriesOf(path));

    expect(info.signed).toBe(false);
    expect(info.schemes).toEqual([]);
    expect(info.readable).toBe(true);
  });

  it("detects a v1 JAR signature from META-INF entries", () => {
    const path = write("v1.apk", baseApkZip(true).toBuffer());
    const info = inspector.inspect(path, entriesOf(path));

    expect(info.hasV1).toBe(true);
    expect(info.signed).toBe(true);
    expect(info.schemes).toEqual(["v1"]);
  });

  it("does not count META-INF certs as v1 without a MANIFEST.MF", () => {
    const zip = baseApkZip();
    zip.addFile("META-INF/CERT.RSA", randomBytes(1200));
    const path = write("cert-only.apk", zip.toBuffer());
    const info = inspector.inspect(path, entriesOf(path));

    expect(info.hasV1).toBe(false);
    expect(info.signed).toBe(false);
  });

  it("parses v2 and v3 ids out of the APK Signing Block", () => {
    const signed = withSigningBlock(baseApkZip().toBuffer(), [
      V2_ID,
      V3_ID,
      PADDING_ID,
    ]);
    const path = write("v2v3.apk", signed);
    const info = inspector.inspect(path, entriesOf(path));

    expect(info.hasV2).toBe(true);
    expect(info.hasV3).toBe(true);
    expect(info.signed).toBe(true);
    expect(info.schemes).toEqual(["v2", "v3"]);
  });

  it("combines v1 entries with signing block schemes", () => {
    const signed = withSigningBlock(baseApkZip(true).toBuffer(), [V2_ID]);
    const path = write("v1v2.apk", signed);
    const info = inspector.inspect(path, entriesOf(path));

    expect(info.schemes).toEqual(["v1", "v2"]);
  });

  it("ignores unknown block ids instead of inventing schemes", () => {
    const signed = withSigningBlock(baseApkZip().toBuffer(), [
      PADDING_ID,
      0xdeadbeef,
    ]);
    const path = write("unknown.apk", signed);
    const info = inspector.inspect(path, entriesOf(path));

    expect(info.signed).toBe(false);
    expect(info.schemes).toEqual([]);
  });

  it("treats a truncated download as unsigned without throwing", () => {
    const full = withSigningBlock(baseApkZip(true).toBuffer(), [V2_ID, V3_ID]);
    const path = write("truncated.apk", full.subarray(0, 2048));
    const info = inspector.inspect(path);

    expect(info.signed).toBe(false);
  });

  it("treats an HTML error page named .apk as unsigned without throwing", () => {
    const path = write(
      "page.apk",
      Buffer.from("<!DOCTYPE html><html><body>blocked</body></html>"),
    );
    const info = inspector.inspect(path);

    expect(info.signed).toBe(false);
  });

  it("surfaces signature details through ApkValidator without failing validation", () => {
    const signed = withSigningBlock(baseApkZip().toBuffer(), [V2_ID, V3_ID]);
    const signedPath = write("validated.apk", signed);
    const unsignedPath = write("validated-unsigned.apk", baseApkZip().toBuffer());
    const validator = new ApkValidator();

    const signedResult = validator.validate(signedPath);
    expect(signedResult.valid).toBe(true);
    expect(signedResult.signature?.signed).toBe(true);

    const unsignedResult = validator.validate(unsignedPath);
    expect(unsignedResult.valid).toBe(true);
    expect(unsignedResult.signature?.signed).toBe(false);
  });
});
