export function assertSerial(serial: string): void {
  if (typeof serial !== "string" || !/^[a-z0-9][a-z0-9._:[\]%-]{0,255}$/i.test(serial)) {
    throw new Error("Invalid device serial");
  }
}
export function assertPackageName(name: string): void {
  if (typeof name !== "string" || !/^[a-zA-Z][\w]*(?:\.[a-zA-Z][\w]*)*$/.test(name) || name.length > 255) {
    throw new Error("Invalid Android package or permission name");
  }
}
export function validateAdbArguments(args: string[]): void {
  if (args[0] === "-s") assertSerial(args[1]);
  const shell = args.indexOf("shell");
  // adb shell joins its argv into a remote shell command; execFile alone is insufficient.
  if (shell >= 0 && args.slice(shell + 1).some((arg) => typeof arg !== "string" ||
      !/^[a-zA-Z0-9_./:=,@%-]+$/.test(arg))) throw new Error("Unsafe remote shell argument");
}
