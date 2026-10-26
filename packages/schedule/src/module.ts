/**
 * The procedures of @procedures/schedule as data. Importing this file registers nothing.
 *
 * Scaffold a procedure with: mark procedure new <name> --path packages/schedule
 *
 * `scheduleModule` keeps the schedules in `defaultScheduleStore` (memory). `createScheduleModule()`
 * gives the same procedures with the store of the host, for example a `FileScheduleStore`. The
 * host gives the same store to its `Scheduler` (roadmap R46).
 */

import { z } from "zod";
import {
  defineModule,
  registerModules,
  PROCEDURE_REGISTRY,
  createProcedure,
  type AnyProcedure,
  type Effects,
  type FsRootRules,
  type ProcedureContext,
  type ProcedureModule,
  type ProcedureRegistry,
} from "@procedures/client";
import { scheduleAdd } from "./procedures/schedule/add.js";
import { scheduleList } from "./procedures/schedule/list.js";
import { scheduleRemove } from "./procedures/schedule/remove.js";
import { scheduleNext } from "./procedures/schedule/next.js";
import { checkTimeZone } from "./cron.js";
import { DEFAULT_SCHEDULE_SETTINGS, PROGRAM_KEY, type ScheduleSettings } from "./programs.js";
import type { ScheduleStore } from "./store.js";
import type {
  Schedule,
  ScheduleAddInput,
  ScheduleAddOutput,
  ScheduleListInput,
  ScheduleListOutput,
  ScheduleNextInput,
  ScheduleNextOutput,
  ScheduleRemoveInput,
  ScheduleRemoveOutput,
} from "./types.js";

// =============================================================================
// Schemas
// =============================================================================

const cron = z.string().min(1).max(200).describe("The cron expression: 5 fields (minute hour day month weekday), or @hourly, @daily, @weekly, @monthly, @yearly");
const timeZone = z
  .string()
  .min(1)
  .max(100)
  .describe("The time zone of the expression: utc, local (default) or an IANA name such as Europe/Berlin");
const scheduleId = z
  .string()
  .regex(/^[A-Za-z0-9._:-]{1,200}$/, "Letters, digits, and . _ : -")
  .describe("The name of the schedule");
const programKey = z.string().max(500).regex(PROGRAM_KEY, "A dotted key: reports.weekly").describe("The dotted key of the stored program");

const run = z.object({
  startedAt: z.number().describe("The start, in milliseconds since 1970"),
  durationMs: z.number(),
  outcome: z.enum(["success", "failure"]),
  error: z.object({ code: z.string().optional(), message: z.string() }).optional(),
});

const view = z.object({
  id: z.string(),
  cron: z.string(),
  program: z.string(),
  input: z.unknown().optional(),
  timeZone: z.string().describe("The time zone: utc, local or an IANA name"),
  createdAt: z.number().describe("When the schedule was added, in milliseconds since 1970"),
  capability: z
    .custom<NonNullable<Schedule["capability"]>>((value) => value !== null && typeof value === "object")
    .optional()
    .describe("The capability of the caller that added it: its clearance and its permitted effects"),
  lastRun: run.optional().describe("The last run"),
  runs: z.number().int(),
  failures: z.number().int(),
  skipped: z.number().int().describe("The times that came during a run: no second run started"),
  nextRunAt: z.string().nullable().describe("The next time as an ISO text, or null"),
});

const ScheduleAddInputSchema = z.object({
  id: scheduleId.optional().describe("The name of the schedule (default: the key of the program)"),
  cron,
  program: programKey,
  input: z.unknown().optional().describe("The input of the program"),
  timeZone: timeZone.optional(),
  replace: z.boolean().optional().describe("True: replace a schedule of the same name (default false)"),
});

const ScheduleAddOutputSchema = z.object({ schedule: view });

const ScheduleListInputSchema = z.object({ program: programKey.optional().describe("Only the schedules of this program") });

const ScheduleListOutputSchema = z.object({ schedules: z.array(view).describe("The schedules, sorted by name") });

const ScheduleRemoveInputSchema = z.object({ id: scheduleId });

const ScheduleRemoveOutputSchema = z.object({ removed: z.boolean().describe("True when the schedule existed") });

const ScheduleNextInputSchema = z.object({
  cron,
  count: z.number().int().min(1).max(100).optional().describe("The number of times, 1 to 100 (default 5)"),
  after: z.string().max(100).optional().describe("The times come after this ISO time (default now)"),
  timeZone: timeZone.optional(),
});

const ScheduleNextOutputSchema = z.object({ times: z.array(z.string()).describe("The next times as ISO texts") });

// =============================================================================
// Procedures
// =============================================================================

/** `schedule.add`: it reads the registry and the program store, and writes the schedules (a store can be a file). */
const ADDS: Effects = Object.freeze({ reads: Object.freeze(["fs", "programs", "registry", "schedules"]), writes: Object.freeze(["fs", "schedules"]) });
/** `schedule.list`: it reads the schedules. */
const LISTS: Effects = Object.freeze({ reads: Object.freeze(["fs", "schedules"]), writes: Object.freeze([]) });
/** `schedule.remove`: it deletes a schedule. A second call changes nothing more. */
const REMOVES: Effects = Object.freeze({ reads: Object.freeze(["fs", "schedules"]), writes: Object.freeze(["fs", "schedules"]), destructive: true, idempotent: true });
/** `schedule.next`: its output comes from its input and the time. */
const PURE: Effects = Object.freeze({ reads: Object.freeze([]), writes: Object.freeze([]) });

/**
 * The rule of `schedule.add`, `schedule.list` and `schedule.remove` under a root of the files
 * (roadmap R33, tracker item O36). No input names a file: the store of the host holds the
 * schedules, and the host chooses its file. So a root has no path to examine. A scheduled program
 * runs its nested calls with their own rules.
 */
const STORE_OF_THE_HOST: FsRootRules = Object.freeze({});

/** The four procedures, with handlers that use the settings. */
function scheduleProcedures(settings: ScheduleSettings): AnyProcedure[] {
  const scheduleAddProcedure = createProcedure()
    .path(["schedule", "add"])
    .input(ScheduleAddInputSchema)
    .output(ScheduleAddOutputSchema)
    .meta({
      description: "Add a schedule: a cron expression that starts a stored program with an input",
      tags: ["schedule", "cron", "programs"],
      args: ["cron", "program"],
      shorts: { timeZone: "z" },
      output: "json",
      effects: ADDS,
      fsRoot: STORE_OF_THE_HOST,
    })
    .handler(async (input: ScheduleAddInput, ctx: ProcedureContext): Promise<ScheduleAddOutput> => scheduleAdd(input, ctx, settings))
    .build();

  const scheduleListProcedure = createProcedure()
    .path(["schedule", "list"])
    .input(ScheduleListInputSchema)
    .output(ScheduleListOutputSchema)
    .meta({
      description: "The schedules, with the next time and the last run of each",
      tags: ["schedule", "cron"],
      args: [],
      shorts: {},
      output: "json",
      effects: LISTS,
      fsRoot: STORE_OF_THE_HOST,
    })
    .handler(async (input: ScheduleListInput): Promise<ScheduleListOutput> => scheduleList(input, settings))
    .build();

  const scheduleRemoveProcedure = createProcedure()
    .path(["schedule", "remove"])
    .input(ScheduleRemoveInputSchema)
    .output(ScheduleRemoveOutputSchema)
    .meta({
      description: "Remove a schedule",
      tags: ["schedule", "cron"],
      args: ["id"],
      shorts: {},
      output: "json",
      effects: REMOVES,
      fsRoot: STORE_OF_THE_HOST,
    })
    .handler(async (input: ScheduleRemoveInput): Promise<ScheduleRemoveOutput> => scheduleRemove(input, settings))
    .build();

  const scheduleNextProcedure = createProcedure()
    .path(["schedule", "next"])
    .input(ScheduleNextInputSchema)
    .output(ScheduleNextOutputSchema)
    .meta({
      description: "The next times of a cron expression",
      tags: ["schedule", "cron"],
      args: ["cron"],
      shorts: { count: "n", timeZone: "z" },
      output: "json",
      effects: PURE,
    })
    .handler(async (input: ScheduleNextInput): Promise<ScheduleNextOutput> => scheduleNext(input, settings))
    .build();

  return [scheduleAddProcedure, scheduleListProcedure, scheduleRemoveProcedure, scheduleNextProcedure];
}

/**
 * The module of this package, for `createRegistry()`: its procedures as data, on
 * `defaultScheduleStore`. Importing this file registers nothing.
 */
export const scheduleModule: ProcedureModule = defineModule("@procedures/schedule", scheduleProcedures(DEFAULT_SCHEDULE_SETTINGS));

export default scheduleModule;

/** The options of `createScheduleModule()`. */
export interface ScheduleModuleOptions {
  /** The store of the schedules. The default is `defaultScheduleStore` (memory). */
  readonly store?: ScheduleStore | undefined;
  /** The wall time, in milliseconds since 1970. The default is `Date.now`. A test gives the time of its fake clock. */
  readonly now?: (() => number) | undefined;
  /**
   * The IANA time zone of the schedules with the time zone `local`, for example `Europe/Berlin`.
   * The default is the time zone of the process. A host gives the same zone to its `Scheduler`.
   */
  readonly timeZone?: string | undefined;
}

/**
 * This function gives the module of this package with the store of the host. Without options, it
 * gives `scheduleModule`. A host gives it to `createRegistry()` before its bundles, so it
 * replaces the `scheduleModule` that a bundle requires (the first module of a name counts).
 *
 * ```ts
 * const store = new FileScheduleStore("schedules.json");
 * const registry = createRegistry(createScheduleModule({ store }), storeModule);
 * await new Scheduler({ registry, store, policy }).start();
 * ```
 */
export function createScheduleModule(options: ScheduleModuleOptions = {}): ProcedureModule {
  if (Object.values(options).every((value) => value === undefined)) return scheduleModule;
  const settings: ScheduleSettings = {
    store: options.store ?? DEFAULT_SCHEDULE_SETTINGS.store,
    now: options.now ?? DEFAULT_SCHEDULE_SETTINGS.now,
    ...(options.timeZone !== undefined ? { timeZone: checkTimeZone(options.timeZone) } : {}),
  };
  return defineModule("@procedures/schedule", scheduleProcedures(settings));
}

/**
 * This function registers the procedures of @procedures/schedule in a registry. The default is the
 * global registry. The options are the options of `createScheduleModule()`.
 */
export function registerScheduleProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY, options: ScheduleModuleOptions = {}): void {
  registerModules(registry, [createScheduleModule(options)]);
}
