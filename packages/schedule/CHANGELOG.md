# @procedures/schedule

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
