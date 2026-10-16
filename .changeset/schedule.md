---
"@procedures/schedule": minor
---

The new package `@procedures/schedule` (roadmap R46) is a cron for stored programs. It has four procedures: `schedule.add` (a cron expression, the key of a stored program and its input), `schedule.list`, `schedule.remove` and `schedule.next` (the next times of an expression, with no store). A schedule starts only a stored program: a procedure of `procedure.define`, or a program of the program store of the registry.

A host starts a `Scheduler` with its registry, its store and its policy. At each minute, the scheduler starts each schedule whose time came, through the registry, with the capability of the host narrowed by the capability of the caller that added the schedule. A schedule has at most one run at a time: a time during a run counts as skipped. The store records the last run and its outcome. A run that passes `runTimeoutMs` gets an abort and the outcome `TIMEOUT`. The scheduler does not start the times that it missed while it was stopped. The timers use an injectable `Clock`.

The package parses cron itself: 5 fields, ranges, steps, lists, the names of the months and of the days, `@daily` and the other names, in UTC or in local time. The schedules persist in a `ScheduleStore`: `MemoryScheduleStore` (the default) or `FileScheduleStore`.
