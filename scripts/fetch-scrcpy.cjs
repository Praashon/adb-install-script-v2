const { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, readFileSync, writeFileSync } = require("fs");
const { join } = require("path");
const { createHash } = require("crypto");
const { safeEntryPath, validateEntries, writeEntry } = require("./safe-archive.cjs");
const checksums = require("./scrcpy-checksums.json");
const ROOT = join(__dirname, "..");
const TARGET_DIR = join(ROOT, "resources", "scrcpy");
const VERSION = process.env.SCRCPY_VERSION || "4.1";
const ASSET = `scrcpy-win64-v${VERSION}`;
const URL = `https://github.com/Genymobile/scrcpy/releases/download/v${VERSION}/${ASSET}.zip`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function download(url, maxBytes = 64 * 1024 ** 2) {
  const signal = AbortSignal.timeout(60000);
  for (let redirects = 0; redirects <= 5; redirects++) {
    const parsed = new globalThis.URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password ||
        !["github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"].includes(parsed.hostname)) throw new Error("Untrusted release URL");
    const response = await fetch(url, { redirect: "manual", signal });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new Error("Release redirect has no destination");
      url = new globalThis.URL(location, url).href;
      continue;
    }
    if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error(`HTTP ${response.status}`); }
    if (Number(response.headers.get("content-length")) > maxBytes) { await response.body.cancel(); throw new Error("Release download exceeds limit"); }
    let size = 0;
    const chunks = [];
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > maxBytes) throw new Error("Release download exceeds limit");
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  throw new Error("Too many release redirects");
}
function extractVerified(buffer, stage, asset) {
  const AdmZip = require("adm-zip");
  const entries = new AdmZip(buffer).getEntries();
  validateEntries(entries, stage, { maxBytes: 256 * 1024 ** 2, maxEntryBytes: 128 * 1024 ** 2, maxEntries: 256 });
  const hashes = {};
  for (const entry of entries) {
    if (!entry.entryName.startsWith(asset + "/")) throw new Error("Unexpected release directory");
    if (entry.isDirectory) continue;
    const name = entry.entryName.slice(asset.length + 1);
    const data = entry.getData();
    if (data.length !== entry.header.size) throw new Error("Archive entry size mismatch");
    writeEntry(stage, name, data);
    hashes[name] = sha256(data);
  }
  if (!hashes["scrcpy.exe"] || !hashes["scrcpy-server"]) throw new Error("Release is missing required scrcpy files");
  return hashes;
}
async function main() {
  if (process.env.SKIP_SCRCPY_DOWNLOAD) { console.log("[scrcpy] Download explicitly skipped."); return; }
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(VERSION)) throw new Error("Invalid scrcpy version");
  const expected = process.env.SCRCPY_SHA256 || checksums[VERSION];
  if (!/^[a-f0-9]{64}$/i.test(expected || "")) throw new Error("A trusted SCRCPY_SHA256 is required for this version");
  const marker = join(TARGET_DIR, ".verified.json");
  if (existsSync(join(TARGET_DIR, "scrcpy.exe"))) {
    if (!existsSync(marker)) throw new Error("Existing scrcpy is unverified; preserve it elsewhere before fetching a verified release");
    const record = JSON.parse(readFileSync(marker, "utf8"));
    if (record.version !== VERSION || record.archiveSha256 !== expected.toLowerCase() || !record.files?.["scrcpy.exe"] || !record.files?.["scrcpy-server"]) throw new Error("Existing release verification does not match");
    for (const [name, digest] of Object.entries(record.files)) {
      if (sha256(readFileSync(safeEntryPath(TARGET_DIR, name))) !== digest) throw new Error("Existing scrcpy file integrity mismatch");
    }
    console.log("[scrcpy] Verified existing installation.");
    return;
  }
  const buffer = await download(URL);
  if (sha256(buffer) !== expected.toLowerCase()) throw new Error("scrcpy SHA-256 mismatch");
  const resources = join(ROOT, "resources");
  mkdirSync(resources, { recursive: true });
  const stage = mkdtempSync(join(resources, ".scrcpy-stage-"));
  try {
    const files = extractVerified(buffer, stage, ASSET);
    writeFileSync(join(stage, ".verified.json"), JSON.stringify({ version: VERSION, archiveSha256: expected.toLowerCase(), files }, null, 2));
    // Preserve the repository's README in the new installation.
    const readme = join(TARGET_DIR, "README.md");
    if (existsSync(readme)) writeFileSync(join(stage, "README.md"), readFileSync(readme));
    // Never delete unknown files supplied by the user.
    if (existsSync(TARGET_DIR)) {
      const { readdirSync } = require("fs");
      if (readdirSync(TARGET_DIR).some((name) => name !== "README.md")) throw new Error("Target contains existing files; refusing to overwrite");
      const backup = stage + "-previous";
      renameSync(TARGET_DIR, backup);
      try { renameSync(stage, TARGET_DIR); } catch (error) { renameSync(backup, TARGET_DIR); throw error; }
      rmSync(backup, { recursive: true });
    } else renameSync(stage, TARGET_DIR);
    console.log(`[scrcpy] Verified and installed ${ASSET}.`);
  } finally { rmSync(stage, { recursive: true, force: true }); }
}
module.exports = { download, extractVerified, sha256 };
if (require.main === module) main().catch((error) => {
  console.error(`[scrcpy] Download failed: ${error.message}`);
  if (!process.argv.includes("--optional")) process.exitCode = 1;
});
