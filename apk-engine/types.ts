export type PackageType = "apk" | "xapk" | "apks" | "split_bundle";
export interface ApkPackageInfo {
  type: PackageType;
  filePath: string;
  fileSize: number;
  packageName?: string;
  versionName?: string;
  versionCode?: number;
  architecture?: string;
  apkFiles: string[];
  obbFiles: string[];
}
export interface ManifestInfo {
  packageName: string;
  versionName?: string;
  versionCode?: number;
  minSdkVersion?: number;
  targetSdkVersion?: number;
  permissions: string[];
}
export interface FingerprintInfo {
  sha256: string;
  packageName: string;
  versionName?: string;
  versionCode?: number;
  certificate?: string;
  architecture?: string;
  fileSize: number;
}
