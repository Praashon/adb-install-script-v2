import { execFile } from "child_process";
import { promisify } from "util";
const execFileAsync = promisify(execFile);

export interface SignatureInfo {
  status: "verified" | "unavailable" | "failed";
  certificateSha256: string[];
  detail: string;
}
export function parseSignerDigests(output: string): string[] {
  return [...new Set([...output.matchAll(/Signer #\d+ certificate SHA-256 digest:\s*([a-f0-9]{64})/gi)]
    .map((match) => match[1].toLowerCase()))].sort();
}
export async function inspectSignature(filePath: string): Promise<SignatureInfo> {
  const jar = process.env.APK_SIGNER_JAR;
  if (!jar) return { status: "unavailable", certificateSha256: [], detail: "Set APK_SIGNER_JAR to Android SDK apksigner.jar to verify signatures offline." };
  try {
    const { stdout } = await execFileAsync(process.env.JAVA_PATH || "java", ["-jar", jar, "verify", "--verbose", "--print-certs", filePath], {
      timeout: 30000, windowsHide: true, maxBuffer: 1024 * 1024,
    });
    const certificateSha256 = parseSignerDigests(stdout);
    if (!certificateSha256.length) throw new Error("No signer certificate was reported");
    return { status: "verified", certificateSha256, detail: "apksigner verified package integrity. Publisher trust and malware safety are not established." };
  } catch {
    return { status: "failed", certificateSha256: [], detail: "Signature verification did not succeed. The tool may be unavailable or the APK may be invalid." };
  }
}
