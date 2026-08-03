import { describe, it, expect } from "vitest";
import { extractManifestInfo } from "@apk-engine/manifest/axml";

function buildStringPool(strings: string[]): Buffer {
  const encoded = strings.map((s) => {
    const bytes = Buffer.from(s, "utf8");
    return Buffer.concat([
      Buffer.from([s.length, bytes.length]),
      bytes,
      Buffer.from([0x00]),
    ]);
  });

  const offsets: number[] = [];
  let running = 0;
  for (const chunk of encoded) {
    offsets.push(running);
    running += chunk.length;
  }

  let data = Buffer.concat(encoded);
  while (data.length % 4 !== 0) data = Buffer.concat([data, Buffer.from([0])]);

  const stringsStart = 28 + strings.length * 4;
  const size = stringsStart + data.length;

  const head = Buffer.alloc(28);
  head.writeUInt16LE(0x0001, 0);
  head.writeUInt16LE(0x001c, 2);
  head.writeUInt32LE(size, 4);
  head.writeUInt32LE(strings.length, 8);
  head.writeUInt32LE(0, 12);
  head.writeUInt32LE(1 << 8, 16);
  head.writeUInt32LE(stringsStart, 20);
  head.writeUInt32LE(0, 24);

  const offsetBuf = Buffer.alloc(strings.length * 4);
  offsets.forEach((o, i) => offsetBuf.writeUInt32LE(o, i * 4));

  return Buffer.concat([head, offsetBuf, data]);
}

function buildStringPoolUtf16(strings: string[]): Buffer {
  const encoded = strings.map((s) => {
    const len = Buffer.alloc(2);
    len.writeUInt16LE(s.length, 0);
    return Buffer.concat([len, Buffer.from(s, "utf16le"), Buffer.from([0, 0])]);
  });

  const offsets: number[] = [];
  let running = 0;
  for (const chunk of encoded) {
    offsets.push(running);
    running += chunk.length;
  }

  let data = Buffer.concat(encoded);
  while (data.length % 4 !== 0) data = Buffer.concat([data, Buffer.from([0])]);

  const stringsStart = 28 + strings.length * 4;
  const size = stringsStart + data.length;

  const head = Buffer.alloc(28);
  head.writeUInt16LE(0x0001, 0);
  head.writeUInt16LE(0x001c, 2);
  head.writeUInt32LE(size, 4);
  head.writeUInt32LE(strings.length, 8);
  head.writeUInt32LE(0, 12);
  head.writeUInt32LE(0, 16);
  head.writeUInt32LE(stringsStart, 20);
  head.writeUInt32LE(0, 24);

  const offsetBuf = Buffer.alloc(strings.length * 4);
  offsets.forEach((o, i) => offsetBuf.writeUInt32LE(o, i * 4));

  return Buffer.concat([head, offsetBuf, data]);
}

function buildStartElement(
  nameRef: number,
  attributes: { nameRef: number; valueRef: number }[],
): Buffer {
  const size = 36 + attributes.length * 20;
  const buf = Buffer.alloc(size);
  buf.writeUInt16LE(0x0102, 0);
  buf.writeUInt16LE(0x0010, 2);
  buf.writeUInt32LE(size, 4);
  buf.writeUInt32LE(1, 8);
  buf.writeUInt32LE(0xffffffff, 12);
  buf.writeUInt32LE(0xffffffff, 16);
  buf.writeUInt32LE(nameRef, 20);
  buf.writeUInt16LE(20, 24);
  buf.writeUInt16LE(20, 26);
  buf.writeUInt16LE(attributes.length, 28);

  attributes.forEach((attr, i) => {
    const base = 36 + i * 20;
    buf.writeUInt32LE(0xffffffff, base);
    buf.writeUInt32LE(attr.nameRef, base + 4);
    buf.writeUInt32LE(attr.valueRef, base + 8);
    buf.writeUInt16LE(8, base + 12);
    buf.writeUInt8(0, base + 14);
    buf.writeUInt8(0x03, base + 15);
    buf.writeUInt32LE(attr.valueRef, base + 16);
  });

  return buf;
}

function buildAxml(chunks: Buffer[]): Buffer {
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(8);
  header.writeUInt16LE(0x0003, 0);
  header.writeUInt16LE(0x0008, 2);
  header.writeUInt32LE(8 + body.length, 4);
  return Buffer.concat([header, body]);
}

describe("extractManifestInfo", () => {
  const S = [
    "manifest",
    "package",
    "com.test.app",
    "uses-permission",
    "name",
    "android.permission.CAMERA",
    "android.permission.INTERNET",
  ];

  const axml = buildAxml([
    buildStringPool(S),
    buildStartElement(0, [{ nameRef: 1, valueRef: 2 }]),
    buildStartElement(3, [{ nameRef: 4, valueRef: 5 }]),
    buildStartElement(3, [{ nameRef: 4, valueRef: 6 }]),
  ]);

  it("reads the package name from the manifest element", () => {
    expect(extractManifestInfo(axml).packageName).toBe("com.test.app");
  });

  it("collects every uses-permission entry", () => {
    const info = extractManifestInfo(axml);
    expect(info.permissions).toContain("android.permission.CAMERA");
    expect(info.permissions).toContain("android.permission.INTERNET");
    expect(info.permissions).toHaveLength(2);
  });

  it("returns empty defaults for a non-AXML buffer", () => {
    const info = extractManifestInfo(Buffer.from("not axml"));
    expect(info.packageName).toBeNull();
    expect(info.permissions).toEqual([]);
  });

  it("decodes a UTF-16 encoded string pool", () => {
    const utf16 = buildAxml([
      buildStringPoolUtf16(S),
      buildStartElement(0, [{ nameRef: 1, valueRef: 2 }]),
      buildStartElement(3, [{ nameRef: 4, valueRef: 5 }]),
    ]);
    const info = extractManifestInfo(utf16);
    expect(info.packageName).toBe("com.test.app");
    expect(info.permissions).toContain("android.permission.CAMERA");
  });
});
