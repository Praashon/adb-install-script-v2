# ADB APK Installer Pro

A Windows desktop application for downloading APKs, reviewing package information, and managing Android devices through ADB.

The application combines installation queues, USB and wireless connections, package management, screen mirroring, and developer tools in one interface. Downloads, analysis, and device operations run locally.

[Source repository](https://github.com/Praashon/adb-install-script-v2) | [Releases](https://github.com/Praashon/adb-install-script-v2/releases) | [Feature status](docs/FEATURES.md)

## Project status

This branch includes security repairs, queue reliability improvements, and an expanded APK Security Center. It is still under development. Remaining dependency advisories and release qualification work are documented in the [security findings](docs/audit/security-findings.md).

Generating a Windows installer does not establish that the application is ready for a production release. Current validation artifacts are unsigned, and automated checks use fixtures rather than real device changes.

## Features

### APK downloads and installation

- Queue downloads from direct links and supported source pages.
- Install local APKs and supported APK bundles.
- Add multiple package files through drag and drop.
- View progress, logs, errors, and installation results.
- Pause, cancel, or retry jobs where the pipeline supports it.
- Run separate device queues while serializing installation pipelines for the same device.
- Review the selected device, package version, compatibility warnings, and installation options before approving an install.

### APK Security Center

- Analyze a local APK without uploading it to a service.
- Read package name, version, minimum SDK, and target SDK when available.
- Calculate the file's SHA-256 hash.
- List detected native architectures and requested permissions.
- Highlight permissions in the application's sensitive-permission catalog.
- Verify signatures and display signer certificate fingerprints when Android SDK signing tools are configured.
- Identify missing or unsupported metadata explicitly.

Permission analysis does not establish that an APK is free of malware. A hash identifies file contents; it does not establish publisher trust. Installed certificate comparison and complete split-package signing checks remain unfinished.

### Device management

- Discover USB devices, wireless devices, and emulators.
- Show connection state and available Android, storage, and battery information.
- Select a preferred installation target.
- Browse installed packages, inspect permissions, and extract installed APK files.
- Uninstall packages, disable apps, or remove cataloged packages for Android user 0 with explicit confirmation.

Removal operations can affect app data and device features. Restoration is not guaranteed, and a failed removal does not silently trigger a different operation.

### Developer tools

- Mirror and control a device through scrcpy.
- Capture screenshots and record the device screen.
- Search and filter logcat output.
- Inspect available CPU and memory measurements.
- Pair supported Android devices using a wireless debugging code.
- Save wireless connection profiles and reconnect eligible devices.

### Source management

- Use bundled source adapters or import declarative JSON plugins.
- Configure supported source selectors and download strategies.
- Test source rules and inspect source health information.
- Use optional Chromium-assisted discovery when a suitable local browser is available.

## Requirements

- Windows with support for the application's Electron runtime. Development and packaging were checked on Windows 11 x64.
- Node.js 20.19 or newer and npm. The current Windows verification used Node.js 24.
- Git for cloning the repository.
- Android SDK Platform-Tools, with ADB available on PATH or configured in application Settings.
- An Android device or emulator with debugging enabled and authorized.

Optional tools:

- scrcpy for screen mirroring. The setup script can download a checksum-pinned Windows build.
- Java and Android SDK apksigner for offline signing verification.
- A supported local Chromium browser for browser-assisted source discovery.

The application does not require root access or a paid cloud service.

## Run from source

```powershell
git clone https://github.com/Praashon/adb-install-script-v2.git
cd adb-install-script-v2
npm ci
npm run dev
```

The dependency installation step rebuilds native modules for Electron and attempts the optional scrcpy download. Existing scrcpy files without verification metadata are preserved and reported rather than silently replaced.

If a native module fails to load, rebuild it for the application's Electron version:

```powershell
node node_modules/electron-builder/cli.js install-app-deps
```

Native modules built for system Node.js may not load in Electron because their binary interfaces differ. See [testing and packaging](docs/TESTING.md) for the verified setup and known toolchain limitations.

## Basic workflow

1. Connect an Android device and accept its debugging authorization prompt.
2. Open Devices and confirm the intended installation target.
3. Download a package, select a local file, or drag package files into the application.
4. Use the APK Security Center to review available metadata, permissions, and signing information.
5. Check the installation preview and approve the operation for the named device.
6. Follow progress and inspect results in Downloads & Jobs.

For Android wireless debugging, use the pairing and connection addresses shown in Android Settings. Legacy TCP mode has a separate warning. The application does not automatically enable Android developer or wireless debugging settings.

## Configure offline signing verification

Set APK_SIGNER_JAR to an existing Android SDK apksigner.jar. Set JAVA_PATH if Java is not available on PATH.

```powershell
$env:APK_SIGNER_JAR = 'C:\Android\Sdk\build-tools\<version>\lib\apksigner.jar'
$env:JAVA_PATH = 'C:\Path\To\Java\bin\java.exe'
npm run dev
```

Replace both example paths with actual paths on your computer. These environment variables apply to the current PowerShell session and processes launched from it.

The verifier reports unavailable or failed status when it cannot complete verification. Successful verification establishes signing integrity and certificate identity, not publisher trust or malware safety.

## Browser extension

The extension sends selected links through a Chrome Native Messaging host to the running desktop application.

The current protocol uses a per-launch authentication token, bounded messages, and desktop confirmation. Approved requests queue a download for review. Installation requires a separate action in the application.

The updated native host and a restrictive Chrome allowed_origins configuration are required. Native host registration is not performed automatically by the audit scripts. Legacy clients that send unauthenticated TCP requests are rejected.

## Test and build

```powershell
npm run typecheck
npm test
npm run test:native
npm run build
npm run test:electron
```

| Command | Purpose |
| --- | --- |
| npm run typecheck | Check main-process and renderer TypeScript |
| npm test | Run unit and fixture-based regression tests |
| npm run test:native | Exercise real SQLite using the Electron native-module interface |
| npm run build | Build main, preload, and renderer bundles |
| npm run test:electron | Run the isolated Electron UI and IPC smoke test |
| npm run fetch:scrcpy | Download and verify the pinned scrcpy release |
| npm run package:dir | Generate an unpacked Windows application |
| npm run package | Generate the Windows installer |

Run the build before the Electron smoke test, and rebuild native dependencies for Electron before native tests when necessary. Some tests need access to their own loopback network fixtures.

Automated device-related checks use synthetic records, mocked operations, or a fake ADB executable. They do not install or remove applications or change debugging settings on real devices.

Windows build artifacts are written to release/. Packaging does not publish them. Signing requires a separately configured signing identity.

## Security and operational limits

- Review and installation previews currently limit APKs to 512 MiB.
- Bundle metadata views may describe only the base APK.
- Pause and resume re-enter a pipeline step. Byte-range download continuation and mid-install resume are not implemented.
- Installations interrupted during a device-changing step pause for review after restart.
- Browser-assisted discovery has a separate networking stack with residual DNS and redirect limitations.
- Archive processing has resource limits but still performs synchronous ZIP work in the main process.
- Remaining dependency and runtime advisories must be resolved before release qualification.

The detailed findings distinguish repaired defects, tested behavior, and residual risks. Read them before relying on the application for sensitive device work.

## Documentation

- [Implemented features and remaining work](docs/FEATURES.md)
- [Testing and Windows packaging](docs/TESTING.md)
- [Architecture audit](docs/audit/architecture.md)
- [Security findings and release blockers](docs/audit/security-findings.md)
- [Bugs and fixes](docs/audit/bugs-and-fixes.md)
- [Performance evidence](docs/audit/performance.md)
- [REA investigation evidence](docs/audit/rea-evidence.md)
- [Engineering checklist](docs/audit/checklist.md)
- [Changelog](CHANGELOG.md)

## License

The project is declared under the MIT license in package.json.
