# @procedures/claude-cli

## 0.9.1

### Patch Changes

- b5db4d8: The other procedures that reach files declare their rules under a root of the files in `metadata.fsRoot` (roadmap R33, tracker item O36). Without a root, nothing changes. PATCH: each procedure was refused under a root before, and now it is confined, or it is refused with a reason.
  
  - Confined: `s3.download` (`destPath`), `s3.presign` (no path input), `exif.read` (`path`), `privacyScan.files` (`paths`, `termsFile`, `allowFile`), `claude.read` and `claude.follow` (`outputFile`), and `manifest.generate` (`outputDir`).
  - Confined with no path input, because the store of the host holds the data: `schedule.add`, `schedule.list`, `schedule.remove`, `procedure.store`, `procedure.load` and `procedure.sync`.
  - Confined: each `gh.*` procedure starts gh in a working folder of the root, and the `dir` of `gh.run.download` is in the root. Its nested `shell.run` now runs under a root. `GIT_DIR` is the null device, so the git of gh finds no repository: give `repo`.
  - Refused, with the reason in the rules: `snapshot.create`, `snapshot.restore`, `snapshot.diff`, `iosBackup.*`, `claude.start`, `server.start`, `server.stop` and `server.status`.
- Updated dependencies [61d60c6]
- Updated dependencies [79f750a]
- Updated dependencies [d0c9856]
- Updated dependencies [b5db4d8]
  - @procedures/client@0.9.1
  - @procedures/shell@0.9.1

## 0.9.0

### Patch Changes

- Updated dependencies [8bb469c]
- Updated dependencies [dc03903]
- Updated dependencies [dca28c1]
  - @procedures/client@0.9.0
  - @procedures/shell@0.9.0

## 0.8.1

### Patch Changes

- Updated dependencies [2d3f235]
- Updated dependencies [1aa9ef7]
- Updated dependencies [2523b1b]
- Updated dependencies [c559b00]
  - @procedures/client@0.8.1
  - @procedures/shell@0.8.1

## 0.8.0

### Patch Changes

- Updated dependencies [4b09a03]
- Updated dependencies [4b09a03]
- Updated dependencies [aa6e3aa]
- Updated dependencies [698e24d]
- Updated dependencies [4b09a03]
- Updated dependencies [600c497]
- Updated dependencies [7c2e7f7]
- Updated dependencies [90ea741]
- Updated dependencies [90ea741]
- Updated dependencies [c4cfa34]
- Updated dependencies [d25805a]
  - @procedures/client@0.8.0
  - @procedures/shell@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [841d083]
- Updated dependencies [389b054]
  - @procedures/client@0.7.0
  - @procedures/shell@0.7.0

## 0.6.0

### Patch Changes

- @procedures/client@0.6.0
  - @procedures/shell@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [0f75644]
- Updated dependencies [09e5566]
- Updated dependencies [ab77f75]
- Updated dependencies [a47bee6]
- Updated dependencies [bc74091]
  - @procedures/client@0.5.0
  - @procedures/shell@0.5.0

## 0.4.0

### Minor Changes

- a90c473: New package: `claude.start` starts one turn of the Claude Code CLI as a detached process that writes stream-json to a file. `claude.read` and `claude.follow` give normalised events from that file, and `claude.cancel` stops the process tree of a turn.

### Patch Changes

- Updated dependencies [d919678]
- Updated dependencies [057d69a]
- Updated dependencies [b2a1a1e]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [afd6a19]
- Updated dependencies [057d69a]
- Updated dependencies [4c51727]
- Updated dependencies [4e751da]
  - @procedures/client@0.4.0
  - @procedures/shell@0.4.0

## 0.3.0

### Minor Changes

- New package: `claude.start`, `claude.read`, `claude.follow` and `claude.cancel` run one turn of the Claude Code CLI as a detached process that writes stream-json to a file, and give normalised events.
