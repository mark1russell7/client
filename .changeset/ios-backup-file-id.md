---
"@procedures/ios-backup": patch
---

`findBackupFile` refuses a file name of `Manifest.db` that is not a hash of 40 hexadecimal digits, with the new code `invalid-file-id`. Before, it joined the name into a path, so a name with `../` in a crafted backup could read a file outside the backup folder. PATCH: a fix.
