# ADB APK Installer Pro

A Windows Electron application for APK downloads, installation queues and authorized Android device management.

Repository: [Praashon/adb-install-script-v2](https://github.com/Praashon/adb-install-script-v2). [Releases](https://github.com/Praashon/adb-install-script-v2/releases).

## Development

Use Node.js 20.19+ or a compatible later version, Git and Android platform-tools. Enable and authorize device debugging on Android. This checkout was tested with system Node 24 and an Electron-ABI native rebuild; see [testing](docs/TESTING.md) for the native-toolchain limitation.

```powershell
git clone https://github.com/Praashon/adb-install-script-v2.git
cd adb-install-script-v2
npm ci
npm run dev
```

Postinstall rebuilds native dependencies for Electron and optionally fetches checksum-pinned scrcpy. Existing unverified scrcpy files are preserved and reported. ADB and optional Android SDK signing tools run locally; no mandatory cloud subscription is used.

## Current capabilities

- Local/file and URL download/install queues with stored progress, logs, pause/cancel and reviewed recovery.
- USB/wireless device cards, saved wireless profiles, installed packages and permissions.
- APK/bundle extraction and offline review with SHA-256, metadata, ABI, permission warnings and optional signing verification.
- Default-cancel installation preview naming device, version, compatibility and relevant options.
- Debloat catalog with package/device-specific confirmation; Android user 0 removal and full uninstall are distinct operations.
- scrcpy mirroring, screenshots/recording, logcat and basic performance metrics.
- Declarative JSON source plugins and optional Chromium-assisted source discovery.

Permission analysis is not a malware verdict. Hashes alone do not establish publisher trust. Resume re-enters a pipeline step; downloads do not implement byte-range continuation and an interrupted ADB install cannot resume midway. Restoration of removed apps/data is not guaranteed.

The extension requires its updated Native Messaging host and restrictive registration. Authenticated requests still require desktop approval and queue a download for review; install separately in the application.

## Verify and package

```powershell
npm run typecheck
npm test
npm run test:native
npm run build
npm run test:electron
npm run package
```

Read [TESTING.md](docs/TESTING.md) before native checks. Windows artifacts are unsigned unless a signing identity is configured. No publishing occurs automatically.

## Audit and feature status

This branch implements a security/reliability increment and partial APK Security Center improvements. It does not finish the entire major-feature mission. Remaining dependency/runtime advisories prevent release qualification.

- [Architecture](docs/audit/architecture.md)
- [Security findings and release blockers](docs/audit/security-findings.md)
- [Bugs and fixes](docs/audit/bugs-and-fixes.md)
- [Performance](docs/audit/performance.md)
- [REA evidence](docs/audit/rea-evidence.md)
- [Feature status](docs/FEATURES.md)
- [Mission checklist](docs/audit/checklist.md)

Automated audit tests use fixtures and isolated profiles; they do not install/remove packages or change debugging settings on your real devices.
