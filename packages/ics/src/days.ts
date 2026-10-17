/**
 * Calendar dates (`YYYY-MM-DD`) with the arithmetic of UTC. A date has no time zone, so a change
 * of daylight saving time does not move it. The years are 0000 to 9999.
 */

const DAY = 86_400_000;

/** The form of a date. */
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * This function gives the time of midnight UTC of a date. A text that is not a real date in the
 * form `YYYY-MM-DD` throws a `RangeError`: `2026-02-30` is not a date.
 */
export function dateTime(date: string, label: string): number {
  const time = DATE.test(date) ? Date.parse(`${date}T00:00:00Z`) : Number.NaN;
  // Date.parse accepts the day 30 of February and gives the 2nd of March: the date must come back
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== date) {
    throw new RangeError(`${label}: ${JSON.stringify(date)} is not a date in the form YYYY-MM-DD`);
  }
  return time;
}

/**
 * This function gives the date `days` days after a date (`YYYY-MM-DD`). A negative number gives
 * an earlier date. The number of days must be an integer.
 *
 * - The arithmetic is the arithmetic of UTC, so a change of daylight saving time does not move the date.
 * - A date that is not valid, or a result outside the years 0000 to 9999, throws a `RangeError`.
 */
export function shiftDay(date: string, days: number): string {
  if (!Number.isSafeInteger(days)) throw new RangeError(`shiftDay: the number of days ${String(days)} is not an integer`);
  const time = dateTime(date, "shiftDay") + days * DAY;
  const text = Number.isFinite(time) && Math.abs(time) <= 8.64e15 ? new Date(time).toISOString() : "";
  if (!/^\d{4}-/.test(text)) throw new RangeError(`shiftDay: ${date} plus ${String(days)} days is not from the year 0000 to 9999`);
  return text.slice(0, 10);
}

/**
 * This function gives the number of whole days from the date `from` to the date `to`
 * (`YYYY-MM-DD`). It is negative when `to` is before `from`, and 0 for the same date.
 *
 * - The count is exact: a calendar day is one day, also on a day with a change of daylight saving time.
 * - A text that is not a date throws a `RangeError`.
 */
export function daysBetween(from: string, to: string): number {
  return (dateTime(to, "daysBetween") - dateTime(from, "daysBetween")) / DAY;
}

/** This function gives the day of the week of a date (`YYYY-MM-DD`): 0 for Sunday to 6 for Saturday. */
export function weekdayOf(date: string): number {
  return new Date(dateTime(date, "weekdayOf")).getUTCDay();
}

/**
 * This function gives the name of the day of the week of a date (`YYYY-MM-DD`). The default is the
 * long English name ("Monday"). `locale` and `style` give another name from `Intl`. A date has no
 * time zone, so the name is the same in each zone.
 */
export function weekdayName(date: string, options: { readonly locale?: string; readonly style?: "long" | "short" | "narrow" } = {}): string {
  const noon = dateTime(date, "weekdayName") + DAY / 2;
  return new Intl.DateTimeFormat(options.locale ?? "en-US", { timeZone: "UTC", weekday: options.style ?? "long" }).format(noon);
}
