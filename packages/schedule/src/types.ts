/**
 * Type definitions of the procedures of this package
 *
 * mark procedure new adds the types of each new procedure here. The zod schemas are in
 * `module.ts`: an exported schema needs a written type (isolatedDeclarations).
 */

import type { PermittedEffects } from "@procedures/client";

/**
 * The time zone of a cron expression: `utc`, `local` (the time zone of the host), or an IANA name
 * that `Intl` knows, for example `Europe/Berlin`.
 */
export type ScheduleTimeZone = "utc" | "local" | (string & {});

/** The last run of a schedule. */
export interface ScheduleRun {
  /** The wall time of the start, in milliseconds since 1970. */
  startedAt: number;
  /** The time of the run, in milliseconds. */
  durationMs: number;
  outcome: "success" | "failure";
  /** The error of a failure: its code, when it has one, and its message. */
  error?: { code?: string | undefined; message: string } | undefined;
}

/** One stored schedule: a cron expression that starts a stored program with an input. */
export interface Schedule {
  /** The name of the schedule. */
  id: string;
  /** The cron expression: 5 fields, or a name such as `@daily`. */
  cron: string;
  /** The dotted key of the stored program: `reports.weekly`. */
  program: string;
  /** The input of the program. */
  input?: unknown;
  /** The time zone of the expression: `utc`, `local` or an IANA name. */
  timeZone: ScheduleTimeZone;
  /** When the schedule was added, in milliseconds since 1970. A schedule starts no run for a time before it. */
  createdAt: number;
  /**
   * The capability of the caller that added the schedule, without its deadline. A run gets the
   * capability of the host, narrowed by this one: a caller cannot start more than it can do.
   */
  capability?: { clearance?: unknown; effects?: PermittedEffects } | undefined;
  lastRun?: ScheduleRun | undefined;
  /** The number of runs. */
  runs: number;
  /** The number of runs that failed. */
  failures: number;
  /** The number of times that came while a run of the schedule was not finished: no second run started. */
  skipped: number;
}

/** A schedule as the procedures give it: with its next time. */
export interface ScheduleView extends Schedule {
  /** The next time, as an ISO text in the time zone of the schedule, or null when the expression has no next time. */
  nextRunAt: string | null;
}

// =============================================================================
// schedule.add
// =============================================================================

export interface ScheduleAddInput {
  /** The name of the schedule. The default is the key of the program. */
  id?: string | undefined;
  cron: string;
  /** The dotted key of the stored program. */
  program: string;
  input?: unknown;
  /** The time zone of the expression: `utc`, `local` or an IANA name such as `Europe/Berlin`. The default is `local`. */
  timeZone?: ScheduleTimeZone | undefined;
  /** True: replace a schedule of the same name. The default is false: a second schedule of a name is an error. */
  replace?: boolean | undefined;
}

export interface ScheduleAddOutput {
  schedule: ScheduleView;
}

// =============================================================================
// schedule.list
// =============================================================================

export interface ScheduleListInput {
  /** Only the schedules of this program. */
  program?: string | undefined;
}

export interface ScheduleListOutput {
  /** The schedules, sorted by name. */
  schedules: ScheduleView[];
}

// =============================================================================
// schedule.remove
// =============================================================================

export interface ScheduleRemoveInput {
  id: string;
}

export interface ScheduleRemoveOutput {
  /** True when the schedule existed. */
  removed: boolean;
}

// =============================================================================
// schedule.next
// =============================================================================

export interface ScheduleNextInput {
  cron: string;
  /** The number of times: 1 to 100. The default is 5. */
  count?: number | undefined;
  /** The times come after this time: an ISO text. The default is now. */
  after?: string | undefined;
  /** The time zone of the expression: `utc`, `local` or an IANA name such as `Europe/Berlin`. The default is `local`. */
  timeZone?: ScheduleTimeZone | undefined;
}

export interface ScheduleNextOutput {
  /** The next times, as ISO texts in the time zone of the expression. Fewer than `count` when the expression has fewer times in the next 9 years. */
  times: string[];
}
