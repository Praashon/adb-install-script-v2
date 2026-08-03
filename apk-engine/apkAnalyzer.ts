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

export function analyzeApkFile(filePath: string): ApkAnalysis {
  const manifest = readManifestBytes(filePath);
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
    packageName: info.packageName,
    versionName: info.versionName,
    versionCode: info.versionCode,
    minSdk: info.minSdk,
    targetSdk: info.targetSdk,
    permissions,
    dangerousCount: permissions.filter((p) => p.dangerous).length,
  };
}

function readManifestBytes(filePath: string): Buffer | null {
  const zip = new AdmZip(filePath);

  const direct = zip.getEntry("AndroidManifest.xml");
  if (direct) return direct.getData();

  const innerApk =
    zip.getEntries().find((e) => /(^|\/)base\.apk$/i.test(e.entryName)) ??
    zip.getEntries().find((e) => e.entryName.toLowerCase().endsWith(".apk"));

  if (innerApk) {
    const inner = new AdmZip(innerApk.getData());
    const manifest = inner.getEntry("AndroidManifest.xml");
    if (manifest) return manifest.getData();
  }

  return null;
}
