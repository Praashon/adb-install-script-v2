# Security findings
Scope: source and locally generated Windows artifacts; synthetic device operations only. Severity is engineering priority, not CVSS. This is not a completed security certification.

| ID / priority | Root cause / affected files | Repair and evidence |
| --- | --- | --- |
| S01 High | main.ts accepted unauthenticated loopback install URLs | 256-bit per-launch token, timing-safe comparison, operation schema, 8 KiB framing, ten requests/minute, sixteen accepted sockets, incomplete-frame deadline; native approval queues download only. TCP regression tests |
| S02 High | fetch-scrcpy.cjs joined untrusted paths, lacked integrity/resource limits, wrote into live resources | Official checksum pin, 64 MiB download / 256 MiB expanded / 128 MiB entry / 256-entry ceilings, path/link/duplicate checks, staging and rename rollback; explicit fetch fails nonzero. Synthetic tests and real verified download |
| S03 High | sandbox:false, no sender/navigation guard or CSP | Enable sandbox; exact-document/main-frame guard for invoke/send; block popups/webviews/redirects/permissions; HTTP(S)-only external opening; CSP. Actual Electron smoke test and unit tests |
| S04 High | adb shell reparsed untrusted package/permission arguments | Package identifiers, serial and remote-shell token validation; absolute APK argv paths. Synthetic hostile strings |
| S05 High | Generic fetch accepted private destinations/redirects, retained cross-origin credentials, lacked limits | Public-address policy, connect-time DNS validation in Undici, per-hop redirect and downgrade checks, credential stripping, page/download ceilings. Policy and mocked transfer tests |
| S06 High | Bundle extraction lacked comprehensive link/path/size/collision policy | Shared archive validator; exclusive/idempotent writes; adm-zip 0.6.1. Synthetic archive tests |
| S07 High | Uninstall/debloat silently changed operation on failure | Native default-cancel confirmation identifies serial/package/exact operation; remove fallback and reversibility promises. Approval tests; no real ADB |
| S08 Medium | wireless stabilization wrote developer/wireless-debugging settings automatically | Remove settings writes; separate legacy TCP warning |
| S09 Medium | Fingerprint regex-scanned AXML and called signing-block hash a certificate fingerprint | Bounded AXML parsing; only apksigner-verified certificate SHA-256 output recorded as signer identity |
| S10 Medium | Missing executors skipped; uncertain installs replayed | Required executor failure; pause uncertain recovery; no automatic install/verify retries; installation preview. Real SQLite tests |
| S11 Medium | Force polling/reconnect bypassed busy guard; offline profiles counted connected | Guard overlap, reconnect offline saved profiles, contain rejected background tasks. Lifecycle tests |
| S12 Medium | Plugin deletion used string prefix containment | Resolve paths and compare actual directory boundaries before recursive removal |

## Extension threat model
Token: %APPDATA%/adb-apk-installer-pro/extension-token; rotated at launch, removed on orderly shutdown, never logged/exposed to renderer. Mode 0600 where honored; Windows inherits current-user AppData ACL. Same-account malware/admin protection is not claimed. Desktop approval remains required even with a valid token. Updated native host required; legacy TCP clients fail closed. Native Messaging registration/allowed_origins still requires correct configuration. No registration was changed.

## Dependency snapshot and release blockers
Baseline: 38 advisories (11 moderate, 23 high, 4 critical). Non-forced audit fix changed 18 packages; patched adm-zip was separately updated and tested. Recorded result: 28 (10 moderate, 15 high, 3 critical). Counts are registry snapshots, not proof of reachability.

Remaining chains include Electron 33, electron-builder/node-gyp/tar, Vitest/tinypool/Vite/esbuild, Drizzle and Tailwind selector tooling. Major migrations were not forced. **The unsigned installer is not release-qualified until runtime/dependency migration and release checks are complete.** Sandbox changes do not patch Electron/Chromium vulnerabilities.

## Residual risks
- Chromium source browsing uses preflight DNS checks and blocks service workers/WebSockets, but Chromium performs its own networking; redirected connections are not all pinned. Strict SSRF protection for that path remains open. Guarded Node downloads use connect-time checked DNS.
- Full IPC payload schemas, source regex complexity, executable-path settings, Windows junction races and every child-process lifecycle need more coverage.
- ZIP work remains synchronous in main; move it to a constrained worker for stronger CPU-exhaustion isolation. Review/preview rejects APKs over 512 MiB.
- Installed signer comparison, key rotation, every split signer and trusted publisher verification are incomplete. Android enforces final signing/install compatibility.
- Static permission classes and computed hashes do not establish malware safety. Legacy stored certificate values are not trusted or destructively erased.
- Real-device disconnect/transfer behavior, clean-machine installation, signing and reproducible releases are unverified.

Primary references: [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [official scrcpy v4.1](https://github.com/Genymobile/scrcpy/releases/tag/v4.1), [Undici connector](https://github.com/nodejs/undici/blob/main/docs/docs/api/Connector.md), [adm-zip advisory](https://github.com/advisories/GHSA-7q85-xj36-vmfc). The scrcpy pin was read from official HTTPS GitHub asset metadata; detached GPG verification was not performed.
