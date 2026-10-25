# @procedures/schedule

## 0.26.2

### Patch Changes

- Updated dependencies [b7a5167]
  - @procedures/store@0.26.2
  - @procedures/client@0.26.2

## 0.26.1

### Patch Changes

- @procedures/client@0.26.1
  - @procedures/store@0.26.1

## 0.26.0

### Patch Changes

- Updated dependencies [a16af64]
  - @procedures/client@0.26.0
  - @procedures/store@0.26.0

## 0.25.0

### Patch Changes

- Updated dependencies [75bff3b]
- Updated dependencies [16562ee]
  - @procedures/client@0.25.0
  - @procedures/store@0.25.0

## 0.24.1

### Patch Changes

- Updated dependencies [ddf8328]
- Updated dependencies [2735505]
  - @procedures/store@0.24.1
  - @procedures/client@0.24.1

## 0.24.0

### Patch Changes

- @procedures/client@0.24.0
  - @procedures/store@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [f20beb1]
- Updated dependencies [71091a5]
  - @procedures/client@0.23.0
  - @procedures/store@0.23.0

## 0.22.1

### Patch Changes

- Updated dependencies [c931188]
  - @procedures/client@0.22.1
  - @procedures/store@0.22.1

## 0.22.0

### Patch Changes

- @procedures/client@0.22.0
  - @procedures/store@0.22.0

## 0.21.0

### Patch Changes

- @procedures/client@0.21.0
  - @procedures/store@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [5f49860]
  - @procedures/client@0.20.0
  - @procedures/store@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [5cb934d]
  - @procedures/client@0.19.0
  - @procedures/store@0.19.0

## 0.18.1

### Patch Changes

- Updated dependencies [d69c8cb]
- Updated dependencies [0379278]
- Updated dependencies [d2713c5]
  - @procedures/client@0.18.1
  - @procedures/store@0.18.1

## 0.18.0

### Patch Changes

- Updated dependencies [5e68b6a]
  - @procedures/client@0.18.0
  - @procedures/store@0.18.0

## 0.17.4

### Patch Changes

- Updated dependencies [b0ccc96]
  - @procedures/store@0.17.4
  - @procedures/client@0.17.4

## 0.17.3

### Patch Changes

- Updated dependencies [d552672]
  - @procedures/store@0.17.3
  - @procedures/client@0.17.3

## 0.17.2

### Patch Changes

- Updated dependencies [8b7e20c]
  - @procedures/client@0.17.2
  - @procedures/store@0.17.2

## 0.17.1

### Patch Changes

- Updated dependencies [1ceb990]
  - @procedures/client@0.17.1
  - @procedures/store@0.17.1

## 0.17.0

### Patch Changes

- @procedures/client@0.17.0
  - @procedures/store@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [deada4b]
  - @procedures/client@0.16.0
  - @procedures/store@0.16.0

## 0.15.1

### Patch Changes

- Updated dependencies [c78da2d]
- Updated dependencies [d99b2d5]
- Updated dependencies [534e4ea]
- Updated dependencies [44fdd60]
  - @procedures/client@0.15.1
  - @procedures/store@0.15.1

## 0.15.0

### Patch Changes

- Updated dependencies [c7198ca]
  - @procedures/client@0.15.0
  - @procedures/store@0.15.0

## 0.14.1

### Patch Changes

- Updated dependencies [85999c1]
- Updated dependencies [fc968f6]
- Updated dependencies [dc7a462]
- Updated dependencies [e091108]
- Updated dependencies [073e4c3]
- Updated dependencies [6969637]
- Updated dependencies [26a145d]
  - @procedures/client@0.14.1
  - @procedures/store@0.14.1

## 0.14.0

### Patch Changes

- Updated dependencies [217a90f]
  - @procedures/client@0.14.0
  - @procedures/store@0.14.0

## 0.13.2

### Patch Changes

- Updated dependencies [3a235b9]
  - @procedures/client@0.13.2
  - @procedures/store@0.13.2

## 0.13.1

### Patch Changes

- @procedures/client@0.13.1
  - @procedures/store@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies [e2fe006]
  - @procedures/client@0.13.0
  - @procedures/store@0.13.0

## 0.12.2

### Patch Changes

- @procedures/store@0.12.2
  - @procedures/client@0.12.2

## 0.12.1

### Patch Changes

- Updated dependencies [b89e3fe]
  - @procedures/client@0.12.1
  - @procedures/store@0.12.1

## 0.12.0

### Patch Changes

- @procedures/client@0.12.0
  - @procedures/store@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [37c96a3]
  - @procedures/client@0.11.0
  - @procedures/store@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [254ee7b]
  - @procedures/client@0.10.0
  - @procedures/store@0.10.0

## 0.9.2

### Patch Changes

- @procedures/client@0.9.2
  - @procedures/store@0.9.2

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
- Updated dependencies [b5db4d8]
  - @procedures/client@0.9.1
  - @procedures/store@0.9.1

## 0.9.0

### Patch Changes

- dca28c1: The packages accept `@mark1russell7/service` 0.5.1 and later 0.5 versions, and `@procedures/client` accepts `@mark1russell7/algebra` 0.7.1. Before, the range `^0.4.1` stopped below 0.5. An application on service 0.5 then got a second copy of service inside the client.
  
  - The client uses only the `/backoff`, `/heartbeat` and `/testing` entries of service. The code of `/backoff`, `/heartbeat` and the clock is the same in 0.4.1 and 0.5.1. `/testing` only gets new exports.
  - The public API of the client does not change.
- Updated dependencies [8bb469c]
- Updated dependencies [dc03903]
- Updated dependencies [dca28c1]
  - @procedures/client@0.9.0
  - @procedures/store@0.9.0

## 0.8.1

### Patch Changes

- Updated dependencies [2d3f235]
- Updated dependencies [1aa9ef7]
- Updated dependencies [2523b1b]
- Updated dependencies [c559b00]
  - @procedures/client@0.8.1
  - @procedures/store@0.8.1

## 0.8.0

### Patch Changes

- Updated dependencies [4b09a03]
- Updated dependencies [4b09a03]
- Updated dependencies [aa6e3aa]
- Updated dependencies [698e24d]
- Updated dependencies [9380ba0]
- Updated dependencies [276b93c]
- Updated dependencies [4b09a03]
- Updated dependencies [600c497]
- Updated dependencies [7c2e7f7]
- Updated dependencies [90ea741]
- Updated dependencies [c4cfa34]
- Updated dependencies [d25805a]
  - @procedures/client@0.8.0
  - @procedures/store@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [841d083]
- Updated dependencies [389b054]
  - @procedures/client@0.7.0
  - @procedures/store@0.7.0

## 0.6.0

### Patch Changes

- @procedures/client@0.6.0
  - @procedures/store@0.6.0

## 0.5.0

### Minor Changes

- 6a98b23: IANA time zones, and a lock file for `FileScheduleStore` across processes:
  
  - `schedule.add`, `schedule.next` and the stored schedules take a time zone `utc`, `local` or an IANA name, for example `Europe/Berlin`. `Intl` examines the name and gives the offsets: the package has no time zone database. An unknown name gives the new error `BAD_TIME_ZONE`.
  - `createScheduleModule({ timeZone })` and `new Scheduler({ timeZone })` give the IANA zone of `local`. The default is the time zone of the process.
  - The changes of daylight saving time follow Vixie cron. A fixed time (no `*` at the start of the minute and hour fields) in the hour that does not exist runs once, at the first minute after the change. A fixed time in the hour that occurs twice runs once, at its first occurrence. An expression with `*` in the minute or hour field follows the clock.
  - The zone `local` uses these rules too. Before, a time in the skipped hour did not run, and a time in the repeated hour could run two times.
  - `FileScheduleStore` holds a lock file (`<path>.lock`, made with the flag `wx`) for each read-change-write. Two processes on one file thus lose no write. A lock older than `staleMs` (default 30 seconds) is stale, and the next store takes it over. A store that waits for twice `staleMs` gives the new error `LOCKED`.
  - The new exports: `checkTimeZone`, `hostTimeZone`, `zoneFor`, `DEFAULT_LOCK_STALE_MS` and `FileScheduleStoreOptions`. `CronExpression` has the new field `fixedTime`.

### Patch Changes

- 0f75644: The dependencies go to `@mark1russell7/algebra` `^0.7.0` and `@mark1russell7/service` `^0.4.1`. A host that uses algebra 0.7.0 gets one copy of it. Algebra 0.7.0 only adds to 0.6.0.
- Updated dependencies [0f75644]
- Updated dependencies [09e5566]
- Updated dependencies [ab77f75]
- Updated dependencies [a47bee6]
- Updated dependencies [89481b0]
- Updated dependencies [bc74091]
- Updated dependencies [bc74091]
  - @procedures/client@0.5.0
  - @procedures/store@0.5.0

## 0.4.0

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
- Updated dependencies [0abf2ec]
- Updated dependencies [4e751da]
  - @procedures/client@0.4.0
  - @procedures/store@0.4.0

## 0.3.0

### Minor Changes

- c56dce3: The new package `@procedures/schedule` (roadmap R46) is a cron for stored programs. It has four procedures: `schedule.add` (a cron expression, the key of a stored program and its input), `schedule.list`, `schedule.remove` and `schedule.next` (the next times of an expression, with no store). A schedule starts only a stored program: a procedure of `procedure.define`, or a program of the program store of the registry.
  
  A host starts a `Scheduler` with its registry, its store and its policy. At each minute, the scheduler starts each schedule whose time came, through the registry, with the capability of the host narrowed by the capability of the caller that added the schedule. A schedule has at most one run at a time: a time during a run counts as skipped. The store records the last run and its outcome. A run that passes `runTimeoutMs` gets an abort and the outcome `TIMEOUT`. The scheduler does not start the times that it missed while it was stopped. The timers use an injectable `Clock`.
  
  The package parses cron itself: 5 fields, ranges, steps, lists, the names of the months and of the days, `@daily` and the other names, in UTC or in local time. The schedules persist in a `ScheduleStore`: `MemoryScheduleStore` (the default) or `FileScheduleStore`.

### Patch Changes

- Updated dependencies [ddea529]
- Updated dependencies [b2a3e3a]
- Updated dependencies [a8c47f1]
- Updated dependencies [381ce3a]
- Updated dependencies [0c627f8]
- Updated dependencies [ae7f05f]
- Updated dependencies [7873940]
- Updated dependencies [a70d445]
- Updated dependencies [bc70357]
- Updated dependencies [07cc998]
- Updated dependencies [a6b01a9]
- Updated dependencies [c799cdd]
- Updated dependencies [540f8d9]
- Updated dependencies [b6daaec]
- Updated dependencies [5b9264e]
- Updated dependencies [956e88b]
- Updated dependencies [ff62281]
- Updated dependencies [d81d0ed]
- Updated dependencies [aa67cc7]
- Updated dependencies [061fa22]
- Updated dependencies [cfb9d69]
- Updated dependencies [43f7de5]
- Updated dependencies [b07bb50]
- Updated dependencies [4ef0d44]
- Updated dependencies [4a3bfa1]
- Updated dependencies [bd0b626]
- Updated dependencies [a6be873]
- Updated dependencies [fb30718]
- Updated dependencies [c5528e4]
- Updated dependencies [fee5d9c]
- Updated dependencies [21f7743]
- Updated dependencies [31a0b46]
  - @procedures/client@0.3.0
  - @procedures/store@0.3.0
