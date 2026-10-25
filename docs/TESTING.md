# Testing and packaging
Baseline at 102fa703: both TypeScript checks, 39 tests and production build passed. Sandbox-only tests first failed five local HTTP fixtures with EACCES; the approved rerun passed.

```powershell
npm ci --ignore-scripts
npm run typecheck
npm test
node node_modules/electron/install.js
node node_modules/electron-builder/cli.js install-app-deps
npm run test:native
npm run build
npm run test:electron
npm run fetch:scrcpy
npm run package
```

npm test needs loopback fixture access. pipeline.test.ts contains a test-only fixture-host override; production networking has no private-network bypass switch. Bridge tests use ephemeral ports and synthetic tokens, not the actual desktop bridge.

test:native bundles a dedicated entry and runs under ELECTRON_RUN_AS_NODE with the same ABI as packaged Electron. It uses a temporary real SQLite file and synthetic devices/jobs. It checks migration preservation, target validation, queue selection, retry guard, recovery, missing executors, pause/cancel. System Node 24 cannot load the Electron ABI. A system-Node rebuild also failed because old node-gyp required distutils removed in Python 3.14; no system Python was changed. Electron native rebuild succeeded.

test:electron requires a build. It creates fresh profile/appData/download folders under ignored node_modules/.cache/audit and deliberately selects Node as the ADB executable. No real ADB server/device is contacted. It exercises sandbox/preload/IPC, rejected untrusted-document IPC, external protocol rejection, synthetic local APK review, keyboard focus/Escape and minimum-width layout. Native picker results are intercepted. Screenshots and process metrics remain in the ignored test cache.

Covered: bridge framing/auth/limits, archive policy, renderer trust, Android identifiers, network/redirect policy, download size/cancel/publication, APK hash/ABI/unknown metadata, signer-output parsing, malformed AXML, reconnection overlap/offline/errors, real SQLite and Electron UI checks.

Pending: every command's mocked process argv, DNS socket integration, historical schemas, split signing, junction races, browser redirect policy, long-running leak tests, real-device disconnect/pairing/install, signing against real APKs, file explorer and diagnostic export.

Explicit fetch:scrcpy failures exit nonzero; postinstall --optional reports errors without failing dependency installation. Another scrcpy version requires an independently trusted SCRCPY_SHA256. Existing unverified binaries are preserved.

Windows x64 unsigned NSIS generation was exercised. It does not establish clean-machine installation or release qualification. No release publishing occurs automatically. Final results/counts and hashes are in the delivered handoff.


## Final verified outcome

- TypeScript node/web checks: passed.
- Vitest: 113/113 tests, six files, approximately 1.50 seconds.
- Native SQLite checks: passed, including active cancellation settlement and shutdown pause.
- Production build and unsigned x64 NSIS packaging: passed.
- Isolated Electron UI/IPC smoke: passed, including minimum supported width.
- Packaged main/preload byte equality, SQLite native module presence and all scrcpy resource hashes: passed.
- npm audit: 28 remaining advisories (10 moderate, 15 high, 3 critical); release blocker.
- No real-device state changes, installer execution or release publishing performed.
