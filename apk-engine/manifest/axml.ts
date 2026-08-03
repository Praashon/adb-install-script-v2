export interface ManifestInfo {
  packageName: string | null;
  versionName: string | null;
  versionCode: number | null;
  minSdk: number | null;
  targetSdk: number | null;
  permissions: string[];
}

const CHUNK_STRING_POOL = 0x0001;
const CHUNK_START_ELEMENT = 0x0102;
const UTF8_FLAG = 1 << 8;

const TYPE_STRING = 0x03;
const TYPE_INT_DEC = 0x10;

interface StringPool {
  strings: string[];
}

export function extractManifestInfo(buffer: Buffer): ManifestInfo {
  const info: ManifestInfo = {
    packageName: null,
    versionName: null,
    versionCode: null,
    minSdk: null,
    targetSdk: null,
    permissions: [],
  };

  if (buffer.length < 8) return info;

  let pool: StringPool | null = null;
  let offset = 8;

  while (offset + 8 <= buffer.length) {
    const chunkType = buffer.readUInt16LE(offset);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkSize < 8 || offset + chunkSize > buffer.length) break;

    if (chunkType === CHUNK_STRING_POOL) {
      pool = parseStringPool(buffer, offset);
    } else if (chunkType === CHUNK_START_ELEMENT && pool) {
      readElement(buffer, offset, pool, info);
    }

    offset += chunkSize;
  }

  return info;
}

function parseStringPool(buffer: Buffer, start: number): StringPool {
  const stringCount = buffer.readUInt32LE(start + 8);
  const flags = buffer.readUInt32LE(start + 16);
  const stringsStart = buffer.readUInt32LE(start + 20);
  const isUtf8 = (flags & UTF8_FLAG) !== 0;

  const strings: string[] = [];
  const offsetsBase = start + 28;
  const dataBase = start + stringsStart;

  for (let i = 0; i < stringCount; i++) {
    const stringOffset = buffer.readUInt32LE(offsetsBase + i * 4);
    strings.push(readPoolString(buffer, dataBase + stringOffset, isUtf8));
  }

  return { strings };
}

function readPoolString(buffer: Buffer, at: number, isUtf8: boolean): string {
  if (at < 0 || at >= buffer.length) return "";

  if (isUtf8) {
    let cursor = at;
    cursor += skipUtf8Len(buffer, cursor);
    const [byteLen, consumed] = readUtf8Len(buffer, cursor);
    cursor += consumed;
    return buffer.toString("utf8", cursor, cursor + byteLen);
  }

  const [charLen, consumed] = readUtf16Len(buffer, at);
  const dataStart = at + consumed;
  return buffer.toString("utf16le", dataStart, dataStart + charLen * 2);
}

function skipUtf8Len(buffer: Buffer, at: number): number {
  const [, consumed] = readUtf8Len(buffer, at);
  return consumed;
}

function readUtf8Len(buffer: Buffer, at: number): [number, number] {
  const first = buffer.readUInt8(at);
  if ((first & 0x80) !== 0) {
    const second = buffer.readUInt8(at + 1);
    return [((first & 0x7f) << 8) | second, 2];
  }
  return [first, 1];
}

function readUtf16Len(buffer: Buffer, at: number): [number, number] {
  const first = buffer.readUInt16LE(at);
  if ((first & 0x8000) !== 0) {
    const second = buffer.readUInt16LE(at + 2);
    return [((first & 0x7fff) << 16) | second, 4];
  }
  return [first, 2];
}

function readElement(
  buffer: Buffer,
  chunkStart: number,
  pool: StringPool,
  info: ManifestInfo,
): void {
  const nameRef = buffer.readUInt32LE(chunkStart + 20);
  const elementName = pool.strings[nameRef] ?? "";

  const attributeCount = buffer.readUInt16LE(chunkStart + 28);
  const attributesStart = chunkStart + 36;

  const attrs = new Map<string, { stringValue: string; intValue: number }>();
  for (let i = 0; i < attributeCount; i++) {
    const base = attributesStart + i * 20;
    if (base + 20 > buffer.length) break;

    const attrName = pool.strings[buffer.readUInt32LE(base + 4)] ?? "";
    const rawValueRef = buffer.readInt32LE(base + 8);
    const dataType = buffer.readUInt8(base + 15);
    const data = buffer.readUInt32LE(base + 16);

    let stringValue = "";
    if (rawValueRef >= 0) {
      stringValue = pool.strings[rawValueRef] ?? "";
    } else if (dataType === TYPE_STRING) {
      stringValue = pool.strings[data] ?? "";
    }

    attrs.set(attrName, {
      stringValue,
      intValue: dataType === TYPE_INT_DEC ? data : Number(stringValue) || 0,
    });
  }

  if (elementName === "manifest") {
    info.packageName = attrs.get("package")?.stringValue || info.packageName;
    info.versionName =
      attrs.get("versionName")?.stringValue || info.versionName;
    const vc = attrs.get("versionCode");
    if (vc) info.versionCode = vc.intValue;
  } else if (elementName === "uses-permission") {
    const name = attrs.get("name")?.stringValue;
    if (name && !info.permissions.includes(name)) info.permissions.push(name);
  } else if (elementName === "uses-sdk") {
    const min = attrs.get("minSdkVersion");
    const target = attrs.get("targetSdkVersion");
    if (min) info.minSdk = min.intValue;
    if (target) info.targetSdk = target.intValue;
  }
}
