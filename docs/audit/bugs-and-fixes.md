# Reproducible bugs and fixes

| Trigger | Result after repair | Verification |
| --- | --- | --- |
| Unauthenticated / fragmented / malformed bridge JSON | Reject unauthorized; bounded framing; desktop approval before download | Synthetic TCP tests |
| Traversal, drive/ADS, link, duplicate or oversized ZIP entry | Reject unsafe extraction | Archive tests |
| Untrusted document uses preload | Reject IPC; sandboxed legitimate preload works | Actual Electron smoke |
| Package contains shell syntax | Reject before process execution | Argument tests |
| Full uninstall or debloat removal fails | Return failure; no different operation attempted | Source review and approval test; no device mutation |
| Wireless stabilization | Warn before TCP mode; no debugging-setting writes | Source/lifecycle checks |
| Two queued installs target one device | Serialize; other device queue can proceed | Real SQLite integration |
| Restart during install/verification | Pause for review, do not automatically repeat | Real SQLite integration |
| Required executor missing | Fail job, do not report success | Real SQLite integration |
| Retry active job | Reject before altering context | Real SQLite integration |
| Cancel during active task/backoff | Abort and settle before row deletion/shutdown | Native state and abort-delay checks |
| Saved profile present but offline | Reconnect without overlapping forced calls | Lifecycle tests |
| MemAvailable missing | Unknown rather than 100% usage | Parser repair |
| Unsupported manifest | Explicit incomplete-metadata warning | Synthetic APK and UI smoke |
| README old repository URLs | Correct v2 repository/release links | Text inspection |

Remaining requirements are explicit in checklist.md and ../FEATURES.md. No unrelated user data was removed.
