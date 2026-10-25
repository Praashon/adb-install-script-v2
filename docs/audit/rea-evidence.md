# REA evidence
Installed reverse-engineer-anything skill version 49 read. Connected MCP tools were available. Q:\rea was not modified.

## Investigation actually run
analyze_javascript_application inspected the local baseline out/ directory, selecting main/main.js and preload/preload.js. Format directory; summary; 30,000ms per-source deadline; 4,000 total / 3,000 per-file semantic nodes; 1,000 unknown limits.

- Root SHA-256: 5be7be4faf5578cd106c64059eab80b0d696b0bb2f913f87d002cdca55e61f8f
- Parent evidence: ev_a65eee8a223ec857a82b233341b370c99a057d46762f713119efed2c880fe38b
- Summary evidence: ev_b12e1867c0214e84d65e81a6946ace3f4a8d0a9bda6b288d1362ab99ec50af6b
- Nine relevant files; two parsed sources; seven files unselected; no parse failures.
- One BrowserWindow, one contextBridge API, 98 exposed members, 89 literal IPC channels, 88 paired renderer transmissions, one dynamic operation.
- Zero sender-validation observations in selected baseline bundles; direct source review separately confirmed absent guards.

## Interpretation
Independent bundle evidence maps built IPC to source. It does not prove runtime exploitability, reachability, all resources or hidden dependencies. Application/semantic coverage is partial; retention caps truncated semantic observations. Dependencies were not recursively analyzed.

No pre-existing release artifact was found in the clone; baseline evidence is a locally generated build, not a shipped public release. Final packaged-ASAR inspection is recorded below if successful. Ghidra was not used because generic Chromium/native runtime decompilation was unnecessary. No REA device mutation/runtime capture was run. Separate Playwright Electron checks used fake ADB.


## Final packaged ASAR investigation

The same bounded tool inspected release/win-unpacked/resources/app.asar, selecting out/main/main.js and out/preload/preload.js. ASAR SHA-256: 9229c07c52875c93d45d66ab26238d79a69469ca317baaed9d39c9ca55063d97.

Parent evidence: ev_4f912266769bbfd001b7e4b37cedf30860e94b0eb1b9f605571f4087dbd8b575. Summary: ev_e092df55191e3182dac65a401a1cf781c34394566cba63d1ba0584a112a65063.

Inventory: 4,235 relevant files; only two JavaScript files parsed, no parse failures. Observed one BrowserWindow, one bridge API, 99 exposed members, 90 literal channels and 89 paired renderer transmissions. Other 4,233 files intentionally unselected. Node and unknown retention caps keep semantic coverage partial.

The final static view still reports zero sender-validation observations: delegated guard helpers and limited static extraction are not recognized as proof. Source inspection and the actual untrusted-document rejection smoke test establish that repair separately. No claim that the static counter proves security is made.

Local ASAR extraction confirmed packaged main/preload bytes exactly match the production build. Native SQLite exists in app.asar.unpacked; every verified scrcpy resource matches its recorded file hash after packaging. Exported retained Evidence is supplied as a compressed handoff artifact; no huge evidence body is printed or committed.
