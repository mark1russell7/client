/**
 * schedule.remove procedure
 *
 * Remove a schedule. A run that started before stays until its end, and its record goes nowhere.
 */

import { DEFAULT_SCHEDULE_SETTINGS, type ScheduleSettings } from "../../programs.js";
import type { ScheduleRemoveInput, ScheduleRemoveOutput } from "../../types.js";

/**
 * Remove a schedule
 */
export async function scheduleRemove(input: ScheduleRemoveInput, settings: ScheduleSettings = DEFAULT_SCHEDULE_SETTINGS): Promise<ScheduleRemoveOutput> {
  return { removed: await settings.store.delete(input.id) };
}
