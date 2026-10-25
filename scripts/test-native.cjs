// Run real SQLite integration tests with the same ABI used by packaged Electron.
const { buildSync } = require("esbuild");
const { spawnSync } = require("child_process");
const { join } = require("path");
const target = join(__dirname, "../node_modules/.cache/audit/native-tests.cjs");
buildSync({ entryPoints: [join(__dirname, "../tests/database.native.ts")], outfile: target,
  bundle: true, platform: "node", format: "cjs", packages: "external", tsconfig: join(__dirname, "../tsconfig.node.json") });
const result = spawnSync(require("electron"), [target], { stdio: "inherit", env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, windowsHide: true });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
