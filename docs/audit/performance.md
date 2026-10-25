# Performance evidence
No measured startup or memory improvement is claimed. Local single runs are not controlled benchmarks.

| Metric | Baseline | Changed |
| --- | --- | --- |
| Main entry JS | 199.98 kB | About 232 kB |
| Preload JS | 7.93 kB | About 8.00 kB |
| Renderer JS | 1,138.52 kB | About 1,143 kB |
| Baseline test run | 39 pass, about 1.7s | Expanded outcome in handoff |
| Node download / page size | Unbounded | 2 GiB / 8 MiB |
| scrcpy download / expanded | Unbounded | 64 MiB / 256 MiB |
| APK review / manifest | Insufficient bounds | 512 MiB / 8 MiB |
| Unterminated logcat carry | Unbounded | 64 KiB retained |

SQLite retains WAL, foreign keys and 5s busy timeout. Log persistence excludes debug/logcat batches and prunes old records at startup. Logcat batches flush every 150ms or above 500 entries; full process/stream stress testing remains open.

Deterministic reliability checks support per-device serialization, paused uncertain recovery, no automatic device-changing retry, missing-executor failure, abortable retry delay and guarded monitor/reconnect overlap.

test:electron reports launch-to-preload latency and process working sets with fake ADB. These include harness startup and are not representative real-device measurements. Route splitting, multi-hour leak testing, USB throughput and actual wireless latency remain unmeasured.


Final fake-ADB smoke observation: launch-to-preload 1,163 ms; working set KiB at capture: Browser 120,860, GPU 117,604, Utility 54,968, renderer Tab 103,356. A prior run measured 1,176 ms. These are observations with the test harness, not controlled before/after improvement evidence.
