---
"@procedures/ios-backup": minor
---

New package: `iosBackup.find`, `iosBackup.file` and `iosBackup.messages` read an iPhone backup (MobileSync) with `node:sqlite`, without a native dependency. Each procedure declares `reads: ["fs"]` and `writes: []`. The package needs Node 22.13 or later.
