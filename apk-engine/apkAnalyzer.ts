import { createReadStream, statSync } from "fs";
import { createHash } from "crypto";
import { dirname } from "path";
import { validateEntries } from "../scripts/safe-archive.cjs";
import { inspectSignature, type SignatureInfo } from "./signature";
import AdmZip from "adm-zip";
import { basename } from "path";
import { extractManifestInfo } from "./manifest/axml";

export interface PermissionInsight {
  name: string;
  dangerous: boolean;
}

export interface ApkAnalysis {
  fileName: string;
  packageName: string | null;
  versionName: string | null;
  versionCode: number | null;
  minSdk: number | null;
  targetSdk: number | null;
  permissions: PermissionInsight[];
  dangerousCount: number;
  sha256: string;
  fileSize: number;
  architectures: string[];
  metadataComplete: boolean;
  signature: SignatureInfo;
  warnings: string[];
}

const DANGEROUS = new Set([
  "android.permission.READ_CALENDAR",
  "android.permission.WRITE_CALENDAR",
  "android.permission.CAMERA",
  "android.permission.READ_CONTACTS",
  "android.permission.WRITE_CONTACTS",
  "android.permission.GET_ACCOUNTS",
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.ACCESS_BACKGROUND_LOCATION",
  "android.permission.RECORD_AUDIO",
  "android.permission.READ_PHONE_STATE",
  "android.permission.READ_PHONE_NUMBERS",
  "android.permission.CALL_PHONE",
  "android.permission.ANSWER_PHONE_CALLS",
  "android.permission.READ_CALL_LOG",
  "android.permission.WRITE_CALL_LOG",
  "android.permission.PROCESS_OUTGOING_CALLS",
  "android.permission.BODY_SENSORS",
  "android.permission.BODY_SENSORS_BACKGROUND",
  "android.permission.ACTIVITY_RECOGNITION",
  "android.permission.SEND_SMS",
  "android.permission.RECEIVE_SMS",
  "android.permission.READ_SMS",
  "android.permission.RECEIVE_WAP_PUSH",
  "android.permission.RECEIVE_MMS",
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.WRITE_EXTERNAL_STORAGE",
  "android.permission.READ_MEDIA_IMAGES",
  "android.permission.READ_MEDIA_VIDEO",
  "android.permission.READ_MEDIA_AUDIO",
  "android.permission.MANAGE_EXTERNAL_STORAGE",
  "android.permission.SYSTEM_ALERT_WINDOW",
  "android.permission.REQUEST_INSTALL_PACKAGES",
  "android.permission.BIND_ACCESSIBILITY_SERVICE",
  "android.permission.WRITE_SECURE_SETTINGS",
  "android.permission.WRITE_SETTINGS",
]);

export async function analyzeApkFile(filePath: string): Promise<ApkAnalysis> {
  const fileSize = statSync(filePath).size;
  if (fileSize > 512 * 1024 ** 2) throw new Error("Offline analysis is limited to 512 MiB per package");
  const zip = new AdmZip(filePath);
  validateEntries(zip.getEntries(), dirname(filePath), { maxEntryBytes: 512 * 1024 ** 2 });
  const inner = zip.getEntry("AndroidManifest.xml") ? zip : readBaseApk(zip, filePath);
  const manifestEntry = inner?.getEntry("AndroidManifest.xml");
  if (manifestEntry && manifestEntry.header.size > 8 * 1024 ** 2) throw new Error("Android manifest exceeds analysis limit");
  const manifest = manifestEntry?.getData();
  const info = manifest
    ? extractManifestInfo(manifest)
    : {
        packageName: null,
        versionName: null,
        versionCode: null,
        minSdk: null,
        targetSdk: null,
        permissions: [] as string[],
      };

  const permissions: PermissionInsight[] = info.permissions
    .map((name) => ({ name, dangerous: DANGEROUS.has(name) }))
    .sort(
      (a, b) =>
        Number(b.dangerous) - Number(a.dangerous) ||
        a.name.localeCompare(b.name),
    );

  return {
    fileName: basename(filePath),
    fileSize,
    sha256: await hashFile(filePath),
    architectures: [...new Set((inner?.getEntries() ?? []).map((entry) => entry.entryName.match(/^lib\/([^/]+)\/[^/]+\.so$/)?.[1]).filter((abi): abi is string => Boolean(abi)))].sort(),
    metadataComplete: Boolean(info.packageName),
    signature: inner === zip ? await inspectSignature(filePath) : { status: "unavailable", certificateSha256: [], detail: "Bundle signing must be checked on every extracted APK; this view analyzes base metadata only." },
    warnings: [
      "Permission analysis does not establish that an APK is malware-free.",
      ...(!info.packageName ? ["Manifest metadata could not be read. Permission results may be incomplete."] : []),
      ...(inner !== zip ? ["Bundle metadata describes the base APK; split compatibility requires installation validation."] : []),
    ],
    packageName: info.packageName,
    versionName: info.versionName,
    versionCode: info.versionCode,
    minSdk: info.minSdk,
    targetSdk: info.targetSdk,
    permissions,
    dangerousCount: permissions.filter((p) => p.dangerous).length,
  };
}

function readBaseApk(zip: AdmZip, filePath: string): AdmZip | null {
  const entry = zip.getEntries().find((item) => /(^|\/)base\.apk$/i.test(item.entryName)) ??
    zip.getEntries().find((item) => item.entryName.toLowerCase().endsWith(".apk"));
  if (!entry) return null;
  if (entry.header.size > 512 * 1024 ** 2) throw new Error("Nested APK exceeds analysis limit");
  const inner = new AdmZip(entry.getData());
  validateEntries(inner.getEntries(), dirname(filePath));
  return inner;
}
async function hashFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}
