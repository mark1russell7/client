/**
 * schedule.add procedure
 *
 * Add a schedule: a cron expression that starts a stored program with an input. The procedure
 * examines the expression and the program, and keeps the capability of the caller: a run gets
 * the capability of the host, narrowed by it.
 */

import { PROCEDURE_REGISTRY, type ProcedureContext } from "@procedures/client";
import { checkTimeZone, formatTime, nextTime, parseCron, zoneFor } from "../../cron.js";
import { ScheduleError } from "../../errors.js";
import { DEFAULT_SCHEDULE_SETTINGS, findProgram, type ScheduleSettings } from "../../programs.js";
import type { Schedule, ScheduleAddInput, ScheduleAddOutput, ScheduleView } from "../../types.js";

/**
 * The view of a schedule: with its next time after `now`. The optional `local` is the IANA time
 * zone of `local`. Without it, `local` is the time zone of the process.
 */
export function viewOf(schedule: Schedule, now: number, local?: string): ScheduleView {
  let nextRunAt: string | null;
  try {
    const zone = zoneFor(schedule.timeZone, local);
    const next = nextTime(parseCron(schedule.cron), now, zone);
    nextRunAt = next === undefined ? null : formatTime(next, zone);
  } catch {
    nextRunAt = null;
  }
  return { ...schedule, nextRunAt };
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
  const cron = parseCron(input.cron);
  const timeZone = checkTimeZone(input.timeZone ?? "local");
  if (nextTime(cron, now, zoneFor(timeZone, settings.timeZone)) === undefined) {
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
  return { schedule: viewOf(schedule, now, settings.timeZone) };
}
