/**
 * The scheduler: a host starts it, and it starts the stored programs of the schedules at their
 * times (roadmap R46).
 *
 * - It wakes at each minute (the unit of cron), reads the schedules of its store, and starts each
 *   schedule whose time came. A schedule that a procedure adds or removes counts at the next minute.
 * - A run goes through the registry, with the capability of the host narrowed by the capability
 *   of the caller that added the schedule. The expose rule, the call rule, the interceptors and
 *   the resources of the host policy apply too.
 * - A schedule has at most one run at a time. A time that comes during a run does not start a
 *   second run: the store counts it as skipped.
 * - The store records the last run of each schedule: its start, its time and its outcome.
 * - A run that passes `runTimeoutMs` gets the abort of its signal and the outcome `TIMEOUT`. The
 *   schedule stays busy until the handler ends: a handler that does not stop blocks only its own
 *   schedule.
 * - The scheduler does not run the times that it missed while it was stopped. Times that it
 *   missed during a run or a slow minute give one run, not one for each time.
 * - The timers use an injectable `Clock` (`after` and `now`), and the calendar uses an injectable
 *   wall clock (`now`, default `Date.now`). A test gives `fakeClock` of `@mark1russell7/service/testing`.
 */

import {
  InvocationError,
  PROCEDURE_REGISTRY,
  invokePath,
  invokeProcedure,
  isRuntimeDefined,
  keyToPath,
  narrowCapability,
  outputValue,
  realClock,
  type Cancel,
  type Capability,
  type Clock,
  type HostPolicy,
  type InvokeOptions,
  type ProcedureRegistry,
} from "@procedures/client";
import { nextTime, parseCron } from "./cron.js";
import { ScheduleError } from "./errors.js";
import { findProgram } from "./programs.js";
import { defaultScheduleStore, type ScheduleStore } from "./store.js";
import type { Schedule, ScheduleRun } from "./types.js";

/** The default time limit of a run: 10 minutes. */
export const DEFAULT_RUN_TIMEOUT_MS = 600_000;

/** What a host gets after each run and each skipped time. */
export interface ScheduleRunEvent {
  readonly id: string;
  readonly program: string;
  readonly outcome: "success" | "failure" | "skipped";
  /** The wall time of the start, in milliseconds since 1970. */
  readonly startedAt: number;
  readonly durationMs: number;
  readonly error?: { readonly code?: string | undefined; readonly message: string } | undefined;
}

/** The options of a `Scheduler`. */
export interface SchedulerOptions {
  /** The registry of the programs. The default is the global registry. */
  readonly registry?: ProcedureRegistry | undefined;
  /** The store of the schedules: the store of the module of the procedures. The default is `defaultScheduleStore`. */
  readonly store?: ScheduleStore | undefined;
  /** The capability of the host for each run. The default is the capability of `policy`, else no limits. */
  readonly capability?: Capability | undefined;
  /** The policy of the host: its expose rule, call rule, interceptors, clearance order, resources and capability. */
  readonly policy?: HostPolicy | undefined;
  /** The clock of the timers and of the durations. The default is `realClock`. */
  readonly clock?: Clock | undefined;
  /** The wall time, in milliseconds since 1970. The default is `Date.now`. */
  readonly now?: (() => number) | undefined;
  /** The time limit of a run, in milliseconds. 0: no limit. The default is 10 minutes. */
  readonly runTimeoutMs?: number | undefined;
  /** This function gets each run and each skipped time. */
  readonly onRun?: ((event: ScheduleRunEvent) => void) | undefined;
  /** This function gets an error of the scheduler itself: a store that cannot be read, for example. */
  readonly onError?: ((error: unknown) => void) | undefined;
}

/** The next time of one schedule, for the version of the schedule that it came from. */
interface Due {
  readonly version: string;
  at: number | undefined;
}

const versionOf = (schedule: Schedule): string => `${schedule.createdAt}|${schedule.cron}|${schedule.timeZone}`;

/** The code and the message of an error. */
function errorInfo(error: unknown): { code?: string; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? { code, message } : { message };
}

/** The next time of a schedule after a time, or undefined for an expression that is not correct. */
function nextOf(schedule: Schedule, after: number): number | undefined {
  try {
    return nextTime(parseCron(schedule.cron), after, schedule.timeZone);
  } catch {
    return undefined;
  }
}

/** A scheduler of the stored programs. See the comment of the file. */
export class Scheduler {
  private readonly registry: ProcedureRegistry;
  private readonly store: ScheduleStore;
  private readonly clock: Clock;
  private readonly now: () => number;
  private readonly runTimeoutMs: number;
  private readonly options: SchedulerOptions;
  private readonly due = new Map<string, Due>();
  private readonly runs = new Map<string, { promise: Promise<void>; controller: AbortController }>();
  private startedAt: number | undefined;
  private cancel: Cancel | undefined;
  private ticking: Promise<void> | undefined;

  constructor(options: SchedulerOptions = {}) {
    this.options = options;
    this.registry = options.registry ?? PROCEDURE_REGISTRY;
    this.store = options.store ?? defaultScheduleStore;
    this.clock = options.clock ?? realClock;
    this.now = options.now ?? (() => Date.now());
    this.runTimeoutMs = options.runTimeoutMs ?? DEFAULT_RUN_TIMEOUT_MS;
    if (!(this.runTimeoutMs >= 0)) throw new TypeError("Scheduler: runTimeoutMs must be 0 or more");
  }

  /** True after `start()` and before `stop()`. */
  get started(): boolean {
    return this.startedAt !== undefined;
  }

  /** The names of the schedules with a run that has not ended. */
  get active(): string[] {
    return [...this.runs.keys()].sort();
  }

  /** This method starts the scheduler: the first times come after now. It gives the end of the first examination. */
  async start(): Promise<void> {
    if (this.startedAt !== undefined) return;
    this.startedAt = this.now();
    await this.tick();
  }

  /** This method stops the timer, aborts the runs, and gives the end of the runs. */
  async stop(): Promise<void> {
    this.startedAt = undefined;
    this.cancel?.();
    this.cancel = undefined;
    this.due.clear();
    for (const run of this.runs.values()) run.controller.abort(new Error("The scheduler stopped"));
    await this.settled();
  }

  /** This method gives the end of the examination in progress and of the runs in progress. */
  async settled(): Promise<void> {
    await this.ticking;
    await Promise.all([...this.runs.values()].map((run) => run.promise));
  }

  /**
   * This method examines the schedules now and starts each one whose time came. It does not wait
   * for the runs. A second call during an examination gives the same examination.
   */
  tick(): Promise<void> {
    this.ticking ??= this.examine().finally(() => {
      this.ticking = undefined;
      this.arm();
    });
    return this.ticking;
  }

  /** This method starts one run of a schedule now, unless it has a run in progress. It gives the event of the run. */
  async runNow(id: string): Promise<ScheduleRunEvent> {
    const schedule = await this.store.get(id);
    if (schedule === undefined) throw new ScheduleError("NOT_FOUND", `No schedule is named ${id}`);
    return new Promise<ScheduleRunEvent>((resolve) => {
      if (!this.launch(schedule, this.now(), resolve)) resolve(this.skip(schedule, this.now()));
    });
  }

  private async examine(): Promise<void> {
    if (this.startedAt === undefined) return;
    const now = this.now();
    let schedules: Schedule[];
    try {
      schedules = await this.store.list();
    } catch (error) {
      this.options.onError?.(error);
      return;
    }
    const ids = new Set(schedules.map((schedule) => schedule.id));
    for (const id of this.due.keys()) if (!ids.has(id)) this.due.delete(id);
    for (const schedule of schedules) {
      // A stop during the read of the store starts nothing
      if (this.startedAt === undefined) return;
      const version = versionOf(schedule);
      let due = this.due.get(schedule.id);
      if (due === undefined || due.version !== version) {
        // A new or a changed schedule: its first time is after it was added, and after the start
        due = { version, at: nextOf(schedule, Math.max(schedule.createdAt, this.startedAt) - 1) };
        this.due.set(schedule.id, due);
      }
      if (due.at === undefined || due.at > now) continue;
      // The times that passed give one run: the next time comes after now
      due.at = nextOf(schedule, now);
      if (!this.launch(schedule, now)) void this.skip(schedule, now);
    }
  }

  /** This method arms the timer for the next minute, or for an earlier time that is due. */
  private arm(): void {
    if (this.startedAt === undefined) return;
    this.cancel?.();
    const now = this.now();
    let wake = Math.floor(now / 60_000) * 60_000 + 60_000;
    for (const due of this.due.values()) if (due.at !== undefined && due.at < wake) wake = due.at;
    this.cancel = this.clock.after(Math.max(0, wake - now), () => {
      this.cancel = undefined;
      void this.tick();
    });
  }

  /** This method gives an event to `onRun`. An error of `onRun` goes to `onError`, not to the scheduler. */
  private report(event: ScheduleRunEvent): void {
    try {
      this.options.onRun?.(event);
    } catch (error) {
      this.options.onError?.(error);
    }
  }

  /** This method records a time that came during a run of the same schedule. */
  private skip(schedule: Schedule, now: number): ScheduleRunEvent {
    const event: ScheduleRunEvent = { id: schedule.id, program: schedule.program, outcome: "skipped", startedAt: now, durationMs: 0 };
    void this.store
      .update(schedule.id, (current) => (current.createdAt === schedule.createdAt ? { ...current, skipped: current.skipped + 1 } : undefined))
      .catch((error: unknown) => this.options.onError?.(error));
    this.report(event);
    return event;
  }

  /** This method starts a run, unless the schedule has one. It gives false for a schedule with a run. */
  private launch(schedule: Schedule, startedAt: number, done?: (event: ScheduleRunEvent) => void): boolean {
    if (this.runs.has(schedule.id)) return false;
    const controller = new AbortController();
    const promise = this.run(schedule, startedAt, controller).then((event) => {
      this.runs.delete(schedule.id);
      this.report(event);
      done?.(event);
    });
    this.runs.set(schedule.id, { promise, controller });
    return true;
  }

  /** One run: the program through the registry, then its record. */
  private async run(schedule: Schedule, startedAt: number, controller: AbortController): Promise<ScheduleRunEvent> {
    const start = this.clock.now();
    let timedOut = false;
    const stopTimer =
      this.runTimeoutMs > 0
        ? this.clock.after(this.runTimeoutMs, () => {
            timedOut = true;
            controller.abort(new Error(`The run of ${schedule.id} passed its time limit of ${this.runTimeoutMs} ms`));
          })
        : undefined;
    let error: { code?: string; message: string } | undefined;
    try {
      await this.invoke(schedule, controller.signal);
    } catch (caught) {
      error = errorInfo(caught);
    } finally {
      stopTimer?.();
    }
    if (timedOut) error = { code: "TIMEOUT", message: `The run passed its time limit of ${this.runTimeoutMs} ms${error ? `: ${error.message}` : ""}` };
    const run: ScheduleRun = {
      startedAt,
      durationMs: Math.max(0, this.clock.now() - start),
      outcome: error === undefined ? "success" : "failure",
      ...(error !== undefined ? { error } : {}),
    };
    try {
      await this.store.update(schedule.id, (current) =>
        current.createdAt === schedule.createdAt
          ? { ...current, lastRun: run, runs: current.runs + 1, failures: current.failures + (error === undefined ? 0 : 1) }
          : undefined,
      );
    } catch (caught) {
      this.options.onError?.(caught);
    }
    return { id: schedule.id, program: schedule.program, outcome: run.outcome, startedAt, durationMs: run.durationMs, ...(error !== undefined ? { error } : {}) };
  }

  /** The options of an invocation: the policy of the host, a capability and the signal of the run. */
  private invokeOptions(capability: Capability | undefined, signal: AbortSignal): InvokeOptions {
    const policy = this.options.policy;
    return {
      registry: this.registry,
      signal,
      ...(capability !== undefined ? { capability } : {}),
      ...(policy?.expose ? { expose: policy.expose } : {}),
      ...(policy?.strictCalls ? { strictCalls: true } : {}),
      ...(policy && policy.interceptors.length > 0 ? { interceptors: policy.interceptors } : {}),
      ...(policy?.clearanceOrder ? { clearanceOrder: policy.clearanceOrder } : {}),
      ...(policy?.resources ? { resources: policy.resources } : {}),
    };
  }

  /** The program of a schedule through the registry, after a load from the program store when the registry does not have it. */
  private async invoke(schedule: Schedule, signal: AbortSignal): Promise<void> {
    const path = keyToPath(schedule.program);
    const host = this.options.capability ?? this.options.policy?.capabilityOf?.();
    if ((await findProgram(this.registry, schedule.program)) === "store") {
      // The load defines the program: a step of the host, with the capability of the host
      await outputValue(await invokePath(["procedure", "load"], { path }, this.invokeOptions(host, signal)), ["procedure", "load"]);
    }
    const procedure = this.registry.get(path);
    if (procedure === undefined || !isRuntimeDefined(procedure)) {
      throw new ScheduleError("NOT_FOUND", `The program ${schedule.program} is not in the registry after its load`);
    }
    const capability = schedule.capability === undefined ? host : narrowCapability(host, schedule.capability, this.options.policy?.clearanceOrder);
    if (signal.aborted) throw new InvocationError("ABORTED", `The run of ${schedule.id} was aborted before its start`, path);
    const output = await invokeProcedure(procedure, schedule.input ?? {}, this.invokeOptions(capability, signal));
    if (output.kind === "stream") {
      for await (const _item of output.items) {
        // A program that gives a stream runs to its end
      }
    }
  }
}
