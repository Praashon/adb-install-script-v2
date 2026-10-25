const { _electron } = require("playwright-core");
const assert = require("node:assert/strict");
const { mkdirSync, mkdtempSync, writeFileSync } = require("fs");
const { join, resolve } = require("path");
const root = resolve(__dirname, "..");
const cache = join(root, "node_modules/.cache/audit");
mkdirSync(cache, { recursive: true });
const directory = mkdtempSync(join(cache, "electron-smoke-"));
for (const name of ["profile", "appdata", "downloads"]) mkdirSync(join(directory, name));
const entry = join(directory, "entry.cjs");
writeFileSync(entry, `const { app } = require('electron');
app.setPath('userData', ${JSON.stringify(join(directory, "profile"))});
app.setPath('appData', ${JSON.stringify(join(directory, "appdata"))});
app.setPath('downloads', ${JSON.stringify(join(directory, "downloads"))});
app.setAppPath(${JSON.stringify(root)});
require(${JSON.stringify(join(root, "out/main/main.js"))});`);
async function main() {
  const env = { ...process.env, ADB_PATH: process.execPath };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_RENDERER_URL;
  // Node is deliberately selected as the ADB executable. No real ADB/device is contacted.
  const started = Date.now();
  const app = await _electron.launch({ args: [entry], env, timeout: 30000 });
  try {
    const page = await app.firstWindow();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.electronAPI));
    const startupMs = Date.now() - started;
    const info = await page.evaluate(() => window.electronAPI.app.getInfo());
    assert.equal(info.adbPath, process.execPath);
    assert.equal(await page.evaluate(() => typeof window.require), "undefined");
    const preferences = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());
    assert.equal(preferences.sandbox, true); assert.equal(preferences.contextIsolation, true); assert.equal(preferences.nodeIntegration, false);
    await page.evaluate(() => { location.hash = "#/downloads"; });
    await page.getByRole("button", { name: "Analyze local APK" }).waitFor();
    const fixture = join(directory, "fixture.apk");
    const AdmZip = require("adm-zip");
    const zip = new AdmZip(); zip.addFile("AndroidManifest.xml", Buffer.from("unsupported manifest fixture"));
    zip.addFile("lib/arm64-v8a/demo.so", Buffer.from("synthetic")); zip.writeZip(fixture);
    await app.evaluate(({ dialog }, fixture) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixture] }); }, fixture);
    await page.getByRole("button", { name: "Analyze local APK" }).click();
    await page.getByRole("dialog", { name: "APK Security Center" }).waitFor();
    await page.getByText("Permission information is unavailable or incomplete.").waitFor();
    await page.screenshot({ path: join(directory, "apk-security-center.png") });
    await page.keyboard.press("Shift+Tab");
    assert.equal(await page.evaluate(() => document.querySelector('[role="dialog"]').contains(document.activeElement)), true);
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached" });
    await page.screenshot({ path: join(directory, "downloads.png") });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 720));
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => document.querySelector('main').scrollWidth <= document.querySelector('main').clientWidth), true);
    await page.screenshot({ path: join(directory, "downloads-960.png") });
    const untrusted = await app.evaluate(async ({ BrowserWindow }, preload) => {
      const window = new BrowserWindow({ show: false, webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false } });
      try {
        await window.loadURL("about:blank");
        return await window.webContents.executeJavaScript("window.electronAPI.app.getInfo().then(() => 'allowed', () => 'rejected')");
      } finally { window.destroy(); }
    }, join(root, "out/preload/preload.js"));
    assert.equal(untrusted, "rejected");
    const external = await page.evaluate(async () => {
      try { await window.electronAPI.app.openExternal("file:///C:/Windows/System32/calc.exe"); return "allowed"; }
      catch { return "rejected"; }
    });
    assert.equal(external, "rejected");
    assert.deepEqual(errors, []);
    const memory = await app.evaluate(({ app }) => app.getAppMetrics().map(({ type, memory }) => ({ type, workingSetSizeKiB: memory.workingSetSize })));
    console.log(JSON.stringify({ status: "passed", directory, startupMs, memory, checks: ["sandboxed preload", "trusted IPC", "no renderer require", "APK analysis navigation", "external protocol rejection"] }, null, 2));
  } finally { await app.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
