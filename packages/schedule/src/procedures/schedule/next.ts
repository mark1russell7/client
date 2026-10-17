/**
 * schedule.next procedure
 *
 * The next times of a cron expression. It reads no store: the output comes from the input and
 * from the time.
 */

import { checkTimeZone, formatTime, nextTimes, parseCron, zoneFor } from "../../cron.js";
import { ScheduleError } from "../../errors.js";
import { DEFAULT_SCHEDULE_SETTINGS, type ScheduleSettings } from "../../programs.js";
import type { ScheduleNextInput, ScheduleNextOutput } from "../../types.js";

/**
 * The next times of a cron expression
 */
export async function scheduleNext(input: ScheduleNextInput, settings: Pick<ScheduleSettings, "now" | "timeZone"> = DEFAULT_SCHEDULE_SETTINGS): Promise<ScheduleNextOutput> {
  const cron = parseCron(input.cron);
  const timeZone = zoneFor(checkTimeZone(input.timeZone ?? "local"), settings.timeZone);
  let after = settings.now();
  if (input.after !== undefined) {
    after = Date.parse(input.after);
    if (Number.isNaN(after)) throw new ScheduleError("BAD_CRON", `after must be an ISO time, not ${JSON.stringify(input.after)}`);
  }
  return { times: nextTimes(cron, after, input.count ?? 5, timeZone).map((time) => formatTime(time, timeZone)) };
}
