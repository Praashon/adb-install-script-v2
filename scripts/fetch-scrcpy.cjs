const { existsSync, mkdirSync, writeFileSync } = require("fs");
const { join, dirname } = require("path");

const ROOT = join(__dirname, "..");
const TARGET_DIR = join(ROOT, "resources", "scrcpy");
const VERSION = process.env.SCRCPY_VERSION || "4.1";
const ASSET = `scrcpy-win64-v${VERSION}`;
const URL = `https://github.com/Genymobile/scrcpy/releases/download/v${VERSION}/${ASSET}.zip`;

async function main() {
  if (process.env.SKIP_SCRCPY_DOWNLOAD) {
    console.log("[scrcpy] SKIP_SCRCPY_DOWNLOAD set, skipping.");
    return;
  }

  if (existsSync(join(TARGET_DIR, "scrcpy.exe"))) {
    console.log("[scrcpy] Already present in resources/scrcpy, skipping.");
    return;
  }

  console.log(`[scrcpy] Downloading ${ASSET}...`);
  const response = await fetch(URL, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${URL}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  const AdmZip = require("adm-zip");
  const zip = new AdmZip(buffer);
  mkdirSync(TARGET_DIR, { recursive: true });

  let written = 0;
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const relative = entry.entryName.replace(/^[^/]+\//, "");
    if (!relative) continue;
    const outPath = join(TARGET_DIR, relative);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, entry.getData());
    written += 1;
  }

  console.log(`[scrcpy] Bundled ${written} file(s) into resources/scrcpy.`);
}

main().catch((error) => {
  console.warn(
    `[scrcpy] Optional download failed (${error.message}). ` +
      "Screen mirroring will look for scrcpy on PATH or a custom Settings path. " +
      "To bundle it, place a scrcpy build in resources/scrcpy or set SCRCPY_VERSION.",
  );
  process.exit(0);
});
