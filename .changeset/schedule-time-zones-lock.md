---
"@procedures/schedule": minor
---

IANA time zones, and a lock file for `FileScheduleStore` across processes:

- `schedule.add`, `schedule.next` and the stored schedules take a time zone `utc`, `local` or an IANA name, for example `Europe/Berlin`. `Intl` examines the name and gives the offsets: the package has no time zone database. An unknown name gives the new error `BAD_TIME_ZONE`.
- `createScheduleModule({ timeZone })` and `new Scheduler({ timeZone })` give the IANA zone of `local`. The default is the time zone of the process.
- The changes of daylight saving time follow Vixie cron. A fixed time (no `*` at the start of the minute and hour fields) in the hour that does not exist runs once, at the first minute after the change. A fixed time in the hour that occurs twice runs once, at its first occurrence. An expression with `*` in the minute or hour field follows the clock.
- The zone `local` uses these rules too. Before, a time in the skipped hour did not run, and a time in the repeated hour could run two times.
- `FileScheduleStore` holds a lock file (`<path>.lock`, made with the flag `wx`) for each read-change-write. Two processes on one file thus lose no write. A lock older than `staleMs` (default 30 seconds) is stale, and the next store takes it over. A store that waits for twice `staleMs` gives the new error `LOCKED`.
- The new exports: `checkTimeZone`, `hostTimeZone`, `zoneFor`, `DEFAULT_LOCK_STALE_MS` and `FileScheduleStoreOptions`. `CronExpression` has the new field `fixedTime`.
