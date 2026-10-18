# @procedures/schedule

[![npm](https://img.shields.io/npm/v/@procedures/schedule?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/schedule)

```sh
npm install @procedures/schedule
```

A cron for stored programs. The procedures add, list and remove schedules. A `Scheduler` that the host starts gives each stored program its runs.

## The procedures

| Procedure | What it does | Effects |
|---|---|---|
| `schedule.add` | It adds a schedule: a cron expression, the key of a stored program, and the input of the program. | reads `fs`, `programs`, `registry`, `schedules`, writes `fs`, `schedules` |
| `schedule.list` | It gives the schedules, sorted, with the next time, the last run and the counts of each. | reads `fs`, `schedules` |
| `schedule.remove` | It removes a schedule. | reads and writes `fs`, `schedules` |
| `schedule.next` | It gives the next times of a cron expression. | none |

- `schedule.add` examines the expression and the program. The program is a procedure that `procedure.define` made, or a program of the program store of the registry. A procedure of code is not a program, so a schedule cannot start `shell.run` directly.
- The name of a schedule (`id`) is the key of the program by default. A second schedule of a name is an error, unless the input has `replace: true`.
- `schedule.next` reads no store. Its output comes from its input and the time.
- A store can be a file, so the procedures that read or write the schedules declare `fs` too.

- The time zone of `schedule.add` and `schedule.next` is `local` by default. It can be `utc` or an IANA name, for example `Europe/Berlin` (refer to [Time zones](#time-zones)).

```ts
await client.call(["schedule", "add"], { cron: "0 9 * * mon-fri", program: "reports.daily", input: { team: "core" }, timeZone: "Europe/Berlin" });
await client.call(["schedule", "next"], { cron: "*/15 * * * *", count: 3 });
```

## The scheduler

A host makes one store, gives it to the module of the procedures and to its `Scheduler`, and starts the scheduler:

```ts
import { createRegistry, hostPolicy } from "@procedures/client";
import { storeModule } from "@procedures/store";
import { createScheduleModule, FileScheduleStore, Scheduler } from "@procedures/schedule";

const store = new FileScheduleStore("schedules.json");
const registry = createRegistry(createScheduleModule({ store }), storeModule);
const scheduler = new Scheduler({ registry, store, policy: hostPolicy({ capability, expose: ["reports.*", "http.*"] }) });
await scheduler.start();
```

- The scheduler wakes at each minute, reads the schedules, and starts each schedule whose time came. A schedule that a procedure adds or removes counts at the next minute.
- A run goes through the registry with the capability of the host. The scheduler narrows it with the capability of the caller that added the schedule, so a caller cannot start more than it can do.
- The expose rule, the call rule, the interceptors, the clearance order and the resources of the policy apply to the calls of the program.
- When the registry does not have the program, the scheduler loads it from the program store of the registry with `procedure.load`, then starts it.
- A schedule has at most one run at a time. A time that comes during a run starts no second run, and the store counts it in `skipped`.
- The store records the last run of each schedule: its start, its time, its outcome and its error. It also counts the runs and the failures.
- A run that passes `runTimeoutMs` (default 10 minutes) gets the abort of its signal and the outcome `TIMEOUT`. The schedule stays busy until the handler ends.
- The scheduler does not start the times that it missed while it was stopped. A late or blocked minute gives one run, not one run for each time that passed.
- `stop()` stops the timer, aborts the runs and gives the end of the runs. `runNow(id)` starts one run at once. `settled()` gives the end of the examination and of the runs.

| Option | Meaning |
|---|---|
| `registry` | The registry of the programs. The default is the global registry. |
| `store` | The store of the schedules. The default is `defaultScheduleStore`, in memory. |
| `capability` | The capability of the host for each run. The default is the capability of `policy`. |
| `policy` | The policy of the host, from `hostPolicy()`. |
| `clock` | The clock of the timers and of the durations. The default is `realClock`. |
| `now` | The wall time in milliseconds. The default is `Date.now`. |
| `timeZone` | The IANA time zone of the schedules with the time zone `local`. The default is the time zone of the process. |
| `runTimeoutMs` | The time limit of a run. 0 sets no limit. |
| `onRun`, `onError` | Functions that get each run and each error of the scheduler. |

A test gives `fakeClock` of `@mark1russell7/service/testing`, and a wall time from it: `now: () => start + clock.now()`. It gives the same `now` to `createScheduleModule()`.

A host gives the same `timeZone` to `createScheduleModule()` and to its `Scheduler`. Then `nextRunAt` of the procedures and the runs of the scheduler agree.

## The stores

- `MemoryScheduleStore` keeps the schedules while the process runs. The default module uses `defaultScheduleStore`, one store in memory for the process.
- `FileScheduleStore` keeps them in a JSON file. A write goes through a temporary file and a rename, so a reader does not see a part of a write.
- `update()` changes one schedule in one step. The record of a run thus does not lose a change of `schedule.add`, and it does not touch a schedule that replaced the old one.

### Two processes on one file

Two processes can use the same `FileScheduleStore` file, and they lose no write. Each change holds a lock file next to the store file: `schedules.json.lock`.

1. The store makes the lock file with the flag `wx`. Only one process can make it. The other processes wait and try again.
2. Under the lock, the store reads the file again, makes its change, writes the file and removes the lock. An error also removes the lock.
3. A lock file older than `staleMs` is stale: its process stopped. The next store takes it over. The default of `staleMs` is 30 seconds.
4. A store that waits for twice `staleMs` gives up with the error `LOCKED`.

```ts
const store = new FileScheduleStore("schedules.json", { staleMs: 30_000 });
```

- To take over a stale lock, a store makes a second lock file (`.lock.break`) with `wx`. It examines the age of the lock again under it, and then it removes the stale lock. Two stores thus cannot both remove the lock.
- The lock file holds a token of its store. A store removes only its own lock, so a slow store does not remove the lock of the store that took it over.
- The lock uses only `node:fs`, with no dependency. A store on a network file system gets the guarantees of the flag `wx` on that system.

## Cron expressions

This package parses cron itself. The format is small, and `Intl` gives the offsets of the time zones. A cron library brings a time zone database or another format that this package does not need.

| Field | Values |
|---|---|
| Minute | 0-59 |
| Hour | 0-23 |
| Day of the month | 1-31 |
| Month | 1-12, or `jan` to `dec` |
| Day of the week | 0-7 (0 and 7 are Sunday), or `sun` to `sat` |

- Each field takes `*`, a number, a range `a-b`, a step after `/` (`*/15`, `a-b/n`, `a/n`), and lists of these with commas.
- The names `@yearly`, `@annually`, `@monthly`, `@weekly`, `@daily`, `@midnight` and `@hourly` replace the 5 fields.
- When the two day fields have a limit, a day matches when one of the two matches, as in Vixie cron. A field that starts with `*` has no limit.
- An expression without a time in the next 9 years is an error of `schedule.add`.

## Time zones

The time zone of a schedule is `local` by default. It can also be `utc` or an IANA name, for example `Europe/Berlin`, `Australia/Adelaide` or `Asia/Kolkata`.

- `local` is the time zone of the process. The option `timeZone` of `createScheduleModule()` and of `Scheduler` gives another zone to `local`.
- `Intl.DateTimeFormat` examines a name and gives the offsets of the zone. The package has no time zone database.
- A name that `Intl` does not know gives the error `BAD_TIME_ZONE`. An offset, for example `+05:30`, is not an IANA name.
- A name that differs from the name of `Intl` only in the case gets the case of `Intl`: `europe/berlin` becomes `Europe/Berlin`.
- `nextRunAt` and the times of `schedule.next` have the offset of the zone at that time: `2026-10-17T09:00:00+02:00`. An offset of 0 gives `Z`.

### The changes of daylight saving time

The changes of daylight saving time follow Vixie cron. The rules depend on the minute field and the hour field of the expression.

A fixed time has no `*` at the start of its minute field and of its hour field, for example `30 2 * * *`:

- A time in the hour that does not exist runs once, at the first minute after the change. In `Europe/Berlin` on 2026-03-29, `30 2 * * *` runs at 03:00 CEST.
- Two times of one expression in that hour give one run.
- A time in the hour that occurs twice runs once, at its first occurrence. In `Europe/Berlin` on 2026-10-25, `30 2 * * *` runs at 02:30 CEST, and not at 02:30 CET.

An expression with `*` at the start of its minute field or of its hour field follows the clock, for example `0 * * * *` or `*/15 * * * *`:

- A time in the hour that does not exist has no run. The clock does not show it.
- A time in the hour that occurs twice runs at the two occurrences. So `*/15 * * * *` runs each 15 minutes of real time across the two changes.

The same rules apply to the zones with a change of 30 minutes, for example `Australia/Lord_Howe`.

## The root of the files

No input of a schedule procedure names a file. Under the root of a host (`mark --fs-root`, `procedure-server --fs-root`, `MCP_FS_ROOT`), `schedule.add`, `schedule.list` and `schedule.remove` use the store of the host. The host chooses the file of a file store, also outside the root. A scheduled program starts its nested calls with their own rules.

## MCP

`schedule.next` and `schedule.list` change nothing, and they are good tools. `schedule.add` makes the host start a program later, at each time, so a host gives it to Claude only on purpose. `schedule.remove` stops the runs that the owner wants.

## Tests

`pnpm --filter @procedures/schedule test` examines the procedures, the stores and the cron expressions. The tests of the scheduler use `fakeClock`, so each time is exact and no test waits.

- The tests of the time zones use fixed dates across the two changes of `Europe/Berlin` and `Australia/Adelaide`, a zone with a half-hour offset.
- The tests of the lock start two child processes. Each one writes 50 schedules to one file, and the file then holds all 100. The Windows job of the nightly workflow runs them too.
