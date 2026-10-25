import { assertPackageName, assertSerial } from "../adb-engine/arguments";

export async function approveDeviceAction(
  serial: string,
  packageName: string,
  operation: "uninstall" | "remove-user" | "disable",
  prompt: (options: { title: string; message: string; detail: string; buttons: string[]; defaultId: number; cancelId: number; noLink: boolean; type: "warning" }) => Promise<{ response: number }>,
): Promise<void> {
  assertSerial(serial);
  assertPackageName(packageName);
  const descriptions = {
    uninstall: "Uninstall the package and delete its app data. Restoration is not guaranteed.",
    "remove-user": "Uninstall for Android user 0. App data may be lost. Restoring the package may require its original APK or a device reset.",
    disable: "Disable for Android user 0. Features and dependent apps may stop working. Re-enabling is supported only if Android permits it.",
  };
  const result = await prompt({
    type: "warning", title: "Confirm device change", message: `${operation}: ${packageName}`,
    detail: `Device: ${serial}\nPackage: ${packageName}\n\n${descriptions[operation]}\n\nNo other operation will be attempted if this fails.`,
    buttons: ["Cancel", "Apply this change"], defaultId: 0, cancelId: 0, noLink: true,
  });
  if (result.response !== 1) throw new Error("Device change cancelled");
}
