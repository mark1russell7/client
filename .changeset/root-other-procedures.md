---
"@procedures/s3": patch
"@procedures/snapshot": patch
"@procedures/schedule": patch
"@procedures/exif": patch
"@procedures/ios-backup": patch
"@procedures/privacy-scan": patch
"@procedures/claude-cli": patch
"@procedures/peer": patch
"@procedures/server": patch
"@procedures/store": patch
"@procedures/gh": patch
---

The other procedures that reach files declare their rules under a root of the files in `metadata.fsRoot` (roadmap R33, tracker item O36). Without a root, nothing changes. PATCH: each procedure was refused under a root before, and now it is confined, or it is refused with a reason.

- Confined: `s3.download` (`destPath`), `s3.presign` (no path input), `exif.read` (`path`), `privacyScan.files` (`paths`, `termsFile`, `allowFile`), `claude.read` and `claude.follow` (`outputFile`), and `manifest.generate` (`outputDir`).
- Confined with no path input, because the store of the host holds the data: `schedule.add`, `schedule.list`, `schedule.remove`, `procedure.store`, `procedure.load` and `procedure.sync`.
- Confined: each `gh.*` procedure starts gh in a working folder of the root, and the `dir` of `gh.run.download` is in the root. Its nested `shell.run` now runs under a root. `GIT_DIR` is the null device, so the git of gh finds no repository: give `repo`.
- Refused, with the reason in the rules: `snapshot.create`, `snapshot.restore`, `snapshot.diff`, `iosBackup.*`, `claude.start`, `server.start`, `server.stop` and `server.status`.
