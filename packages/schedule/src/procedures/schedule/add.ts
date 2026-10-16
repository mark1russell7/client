/**
 * schedule.add procedure
 *
 * Add a schedule: a cron expression that starts a stored program with an input. The procedure
 * examines the expression and the program, and keeps the capability of the caller: a run gets
 * the capability of the host, narrowed by it.
 */

import { PROCEDURE_REGISTRY, type ProcedureContext } from "@procedures/client";
import { formatTime, nextTime, parseCron } from "../../cron.js";
import { ScheduleError } from "../../errors.js";
import { DEFAULT_SCHEDULE_SETTINGS, findProgram, type ScheduleSettings } from "../../programs.js";
import type { Schedule, ScheduleAddInput, ScheduleAddOutput, ScheduleView } from "../../types.js";

/** The view of a schedule: with its next time after `now`. */
export function viewOf(schedule: Schedule, now: number): ScheduleView {
  let next: number | undefined;
  try {
    next = nextTime(parseCron(schedule.cron), now, schedule.timeZone);
  } catch {
    next = undefined;
  }
  return { ...schedule, nextRunAt: next === undefined ? null : formatTime(next, schedule.timeZone) };
}

/** The capability of the caller to keep: its clearance and its permitted effects, without its deadline. */
function callerCapability(ctx: Pick<ProcedureContext, "capability"> | undefined): Schedule["capability"] {
  const capability = ctx?.capability;
  if (capability === undefined) return undefined;
  const kept: NonNullable<Schedule["capability"]> = {};
  if (capability.clearance !== undefined) kept.clearance = capability.clearance;
  if (capability.effects !== undefined) kept.effects = capability.effects;
  return Object.keys(kept).length > 0 ? kept : undefined;
}

/**
 * Add a schedule: a cron expression that starts a stored program with an input
 */
export async function scheduleAdd(input: ScheduleAddInput, ctx?: Pick<ProcedureContext, "capability" | "registry">, settings: ScheduleSettings = DEFAULT_SCHEDULE_SETTINGS): Promise<ScheduleAddOutput> {
  const now = settings.now();
  const timeZone = input.timeZone ?? "local";
  const cron = parseCron(input.cron);
  if (nextTime(cron, now, timeZone) === undefined) {
    throw new ScheduleError("BAD_CRON", `The cron expression ${JSON.stringify(input.cron)} has no time in the next 9 years`);
  }
  await findProgram(ctx?.registry ?? PROCEDURE_REGISTRY, input.program);
  const id = input.id ?? input.program;
  const capability = callerCapability(ctx);
  const schedule: Schedule = {
    id,
    cron: cron.source,
    program: input.program,
    ...(input.input !== undefined ? { input: input.input } : {}),
    timeZone,
    createdAt: now,
    ...(capability !== undefined ? { capability } : {}),
    runs: 0,
    failures: 0,
    skipped: 0,
  };
  if (input.replace !== true && (await settings.store.get(id)) !== undefined) {
    throw new ScheduleError("EXISTS", `A schedule named ${id} exists: give replace: true, or another id`);
  }
  await settings.store.put(schedule);
  return { schedule: viewOf(schedule, now) };
}
