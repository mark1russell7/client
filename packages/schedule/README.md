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

```ts
await client.call(["schedule", "add"], { cron: "0 9 * * mon-fri", program: "reports.daily", input: { team: "core" } });
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
| `runTimeoutMs` | The time limit of a run. 0 sets no limit. |
| `onRun`, `onError` | Functions that get each run and each error of the scheduler. |

A test gives `fakeClock` of `@mark1russell7/service/testing`, and a wall time from it: `now: () => start + clock.now()`. It gives the same `now` to `createScheduleModule()`.

## The stores

- `MemoryScheduleStore` keeps the schedules while the process runs. The default module uses `defaultScheduleStore`, one store in memory for the process.
- `FileScheduleStore` keeps them in a JSON file. A write goes through a temporary file and a rename. The store is for one process.
- `update()` changes one schedule in one step. The record of a run thus does not lose a change of `schedule.add`, and it does not touch a schedule that replaced the old one.

## Cron expressions

This package parses cron itself. The format is small, and a cron library brings a time zone database or another format that this package does not need.

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
- The time zone is `local` (the time of the host) by default, or `utc`.
- In local time, a time that the change to summer time skips gives no run. A time that the change back repeats can give two runs.
- An expression without a time in the next 9 years is an error of `schedule.add`.

## MCP

`schedule.next` and `schedule.list` change nothing, and they are good tools. `schedule.add` makes the host start a program later, at each time, so a host gives it to Claude only on purpose. `schedule.remove` stops the runs that the owner wants.

## Tests

`pnpm --filter @procedures/schedule test` examines the procedures, the stores and the cron expressions. The tests of the scheduler use `fakeClock`, so each time is exact and no test waits.
