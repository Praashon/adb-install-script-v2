import type { ApkAnalysis } from "./apkAnalyzer";

export function installationWarnings(analysis: Pick<ApkAnalysis, "minSdk" | "targetSdk" | "architectures" | "versionCode" | "packageName">, device: {
  sdkVersion?: string; supportedAbis?: string[]; installedVersionCode?: number;
}): { blocked: boolean; warnings: string[] } {
  const warnings: string[] = [];
  let blocked = false;
  const sdk = Number(device.sdkVersion);
  if (analysis.minSdk && sdk > 0 && analysis.minSdk > sdk) {
    warnings.push(`Requires SDK ${analysis.minSdk}; device has SDK ${sdk}.`); blocked = true;
  }
  if (!analysis.minSdk || !sdk) warnings.push("SDK compatibility could not be determined.");
  if (analysis.architectures.length && device.supportedAbis?.length && !analysis.architectures.some((abi) => device.supportedAbis!.includes(abi))) {
    warnings.push("The APK's native libraries do not match the device's supported ABIs."); blocked = true;
  }
  if (analysis.architectures.length && !device.supportedAbis?.length) warnings.push("Device ABI compatibility could not be determined.");
  if (analysis.versionCode !== null && device.installedVersionCode !== undefined && analysis.versionCode < device.installedVersionCode) {
    warnings.push(`Downgrade: installed version code ${device.installedVersionCode}, selected ${analysis.versionCode}. App data may become incompatible.`);
  }
  if (!analysis.packageName) warnings.push("Package metadata is incomplete; installation identity could not be determined.");
  return { blocked, warnings };
}
