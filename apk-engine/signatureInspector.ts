import { openSync, readSync, closeSync, statSync } from "fs";

export type SignatureScheme = "v1" | "v2" | "v3" | "v3.1";

export interface SignatureInfo {
  signed: boolean;
  schemes: SignatureScheme[];
  hasV1: boolean;
  hasV2: boolean;
  hasV3: boolean;
  readable: boolean;
  detail?: string;
}

const EOCD_SIGNATURE = 0x06054b50;
const EOCD_MIN_SIZE = 22;
const EOCD_MAX_COMMENT = 0xffff;
const SIG_BLOCK_MAGIC = "APK Sig Block 42";
const SIG_BLOCK_FOOTER = 24;

const SCHEME_IDS: Record<number, SignatureScheme> = {
  0x7109871a: "v2",
  0xf05368c0: "v3",
  0x1b93ad61: "v3.1",
};

export class SignatureInspector {
  inspect(filePath: string, entryNames?: string[]): SignatureInfo {
    const v1 = entryNames ? this.detectV1FromEntries(entryNames) : false;
    let blockSchemes: SignatureScheme[] = [];
    let readable = true;
    let detail: string | undefined;

    try {
      blockSchemes = this.readSigningBlockSchemes(filePath);
    } catch (error) {
      readable = false;
      detail = error instanceof Error ? error.message : "Unknown error";
    }

    const schemes: SignatureScheme[] = v1 ? ["v1", ...blockSchemes] : blockSchemes;
    const hasV2 = blockSchemes.includes("v2");
    const hasV3 = blockSchemes.includes("v3") || blockSchemes.includes("v3.1");

    return {
      signed: schemes.length > 0,
      schemes,
      hasV1: v1,
      hasV2,
      hasV3,
      readable,
      detail,
    };
  }

  private detectV1FromEntries(entryNames: string[]): boolean {
    const hasManifest = entryNames.some(
      (name) => name.toUpperCase() === "META-INF/MANIFEST.MF",
    );
    if (!hasManifest) return false;
    return entryNames.some((name) => {
      const upper = name.toUpperCase();
      return (
        upper.startsWith("META-INF/") &&
        (upper.endsWith(".RSA") ||
          upper.endsWith(".DSA") ||
          upper.endsWith(".EC"))
      );
    });
  }

  private readSigningBlockSchemes(filePath: string): SignatureScheme[] {
    const fileSize = statSync(filePath).size;
    if (fileSize < EOCD_MIN_SIZE) return [];

    const fd = openSync(filePath, "r");
    try {
      const centralDirOffset = this.findCentralDirectoryOffset(fd, fileSize);
      if (centralDirOffset === undefined) return [];
      if (centralDirOffset < SIG_BLOCK_FOOTER) return [];

      const footer = this.readAt(fd, centralDirOffset - SIG_BLOCK_FOOTER, SIG_BLOCK_FOOTER);
      if (footer.length < SIG_BLOCK_FOOTER) return [];
      if (footer.subarray(8, 24).toString("latin1") !== SIG_BLOCK_MAGIC) {
        return [];
      }

      const blockSize = Number(footer.readBigUInt64LE(0));
      const blockStart = centralDirOffset - blockSize - 8;
      if (!Number.isSafeInteger(blockSize) || blockStart < 0) return [];

      const pairsLength = centralDirOffset - SIG_BLOCK_FOOTER - (blockStart + 8);
      if (pairsLength <= 0) return [];

      const pairs = this.readAt(fd, blockStart + 8, pairsLength);
      return this.parsePairs(pairs);
    } finally {
      closeSync(fd);
    }
  }

  private parsePairs(pairs: Buffer): SignatureScheme[] {
    const found = new Set<SignatureScheme>();
    let offset = 0;
    while (offset + 12 <= pairs.length) {
      const pairSize = Number(pairs.readBigUInt64LE(offset));
      if (!Number.isSafeInteger(pairSize) || pairSize < 4) break;
      if (offset + 8 + pairSize > pairs.length) break;
      const id = pairs.readUInt32LE(offset + 8);
      const scheme = SCHEME_IDS[id];
      if (scheme) found.add(scheme);
      offset += 8 + pairSize;
    }
    return [...found];
  }

  private findCentralDirectoryOffset(
    fd: number,
    fileSize: number,
  ): number | undefined {
    const scanLength = Math.min(fileSize, EOCD_MIN_SIZE + EOCD_MAX_COMMENT);
    const scanStart = fileSize - scanLength;
    const buffer = this.readAt(fd, scanStart, scanLength);

    for (let i = buffer.length - EOCD_MIN_SIZE; i >= 0; i--) {
      if (buffer.readUInt32LE(i) !== EOCD_SIGNATURE) continue;
      const offset = buffer.readUInt32LE(i + 16);
      if (offset === 0xffffffff) return undefined;
      if (offset >= fileSize) continue;
      return offset;
    }
    return undefined;
  }

  private readAt(fd: number, position: number, length: number): Buffer {
    const buffer = Buffer.alloc(length);
    const bytesRead = readSync(fd, buffer, 0, length, position);
    return buffer.subarray(0, bytesRead);
  }
}

export function describeSignature(info: SignatureInfo): string {
  if (!info.signed) return "unsigned";
  return info.schemes.join(", ");
}
