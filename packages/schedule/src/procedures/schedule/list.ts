/**
 * schedule.list procedure
 *
 * The schedules, sorted by name, with the next time, the last run and the counts of each.
 */

import { DEFAULT_SCHEDULE_SETTINGS, type ScheduleSettings } from "../../programs.js";
import type { ScheduleListInput, ScheduleListOutput } from "../../types.js";
import { viewOf } from "./add.js";

/**
 * The schedules, with the next time and the last run of each
 */
export async function scheduleList(input: ScheduleListInput, settings: ScheduleSettings = DEFAULT_SCHEDULE_SETTINGS): Promise<ScheduleListOutput> {
  const now = settings.now();
  const schedules = await settings.store.list();
  return {
    schedules: schedules.filter((schedule) => input.program === undefined || schedule.program === input.program).map((schedule) => viewOf(schedule, now)),
  };
}
