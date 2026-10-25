# Feature status

| Mission feature | Existing / delivered increment | Remaining |
| --- | --- | --- |
| APK Security Center | Existing permission view extended with local picker, SHA-256, SDK/ABI, explicit unknown states, optional apksigner and native compatibility preview | Installed signer comparison, rotation lineage, every split signer/compatibility check, worker isolation |
| Multi-device workspace | Existing device cards/details/preference; serial queues per selected target and no missing-explicit-target fallback | Queue/history filtering/export, multi-target selection and warnings |
| Android File Explorer | Existing installed-package APK pull only; no graphical explorer added | Folder navigation, scoped upload/download, progress/cancel/overwrite/recovery |
| Debloat | Existing vendor/risk catalog; exact package/device/user-0 confirmations, no silent fallback | Durable operation history/export and restore/enable UX |
| Diagnostics | Existing battery/free-space, CPU/memory samples, logcat and captures; missing memory values handled honestly | Health/temperatures, snapshots, report export, retained trends |
| Wireless | Existing code pairing/profiles/timer reconnect; no automatic debugging settings, TCP warning, offline/overlap fixes | QR help, backoff, richer lifecycle errors and real-network tests |
| Installer queue | Existing stored progress/logs/bulk input; device serialization, safer recovery/retry/cancel and preview | Batch-wide preview/results export, byte-range continuation |
| UI/UX | Existing bench identity retained; review content, wrapping toolbar, focus trap/restoration, clearer caveats | Broad accessibility/contrast/responsive audit |

## Offline signing
Optionally set APK_SIGNER_JAR to existing Android SDK apksigner.jar and JAVA_PATH to Java if needed. Runs java -jar <jar> verify --verbose --print-certs <apk>, capped at 30 seconds/1 MiB output. Missing tooling/failure is explicit. Successful verification establishes integrity/signing identity, not trusted publisher or malware safety.

Review/preview limits APKs to 512 MiB; installation preview analyzes the extracted base APK. Bundle-only review is labeled base metadata. Legacy stored certificate hashes are not used as signer-comparison evidence.
