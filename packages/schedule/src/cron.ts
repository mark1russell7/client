/**
 * Cron expressions (roadmap R46): the parse and the next times.
 *
 * This package parses cron itself. The format is small, and a dependency for it gives a time
 * zone database or a second format that this package does not need.
 *
 * - 5 fields: minute (0-59), hour (0-23), day of the month (1-31), month (1-12), day of the week
 *   (0-7, with 0 and 7 for Sunday).
 * - Each field: `*`, a number, a range `a-b`, a step `*` + `/n`, `a-b/n` or `a/n` (from `a` to the
 *   end), and lists of these with commas.
 * - The names of the months (`jan` to `dec`) and of the days (`sun` to `sat`), in each case.
 * - The names `@yearly` (`@annually`), `@monthly`, `@weekly`, `@daily` (`@midnight`) and `@hourly`.
 * - The days, as in Vixie cron: when the two day fields have a limit (they do not start with
 *   `*`), a day matches when one of the two matches. Else the field with a limit decides.
 *
 * The times are in UTC or in the local time of the host. In local time, a time that the change
 * to summer time skips does not run, and a time that the change back repeats can run two times.
 */

import { ScheduleError } from "./errors.js";
import type { ScheduleTimeZone } from "./types.js";

/** A parsed cron expression. */
export interface CronExpression {
  readonly source: string;
  readonly minutes: ReadonlySet<number>;
  readonly hours: ReadonlySet<number>;
  readonly days: ReadonlySet<number>;
  readonly months: ReadonlySet<number>;
  /** The days of the week, 0 (Sunday) to 6. */
  readonly weekdays: ReadonlySet<number>;
  /** True when the field of the day of the month does not start with `*`. */
  readonly dayLimited: boolean;
  /** True when the field of the day of the week does not start with `*`. */
  readonly weekdayLimited: boolean;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

interface FieldSpec {
  readonly name: string;
  readonly min: number;
  readonly max: number;
  /** The names of the values, from `first`. */
  readonly names?: readonly string[];
  readonly first?: number;
}

const FIELDS: readonly FieldSpec[] = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "day of the month", min: 1, max: 31 },
  { name: "month", min: 1, max: 12, names: MONTHS, first: 1 },
  { name: "day of the week", min: 0, max: 7, names: DAYS, first: 0 },
];

/** The names of the expressions that are one name. */
export const CRON_NAMES: Readonly<Record<string, string>> = Object.freeze({
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
});

function fail(source: string, message: string): never {
  throw new ScheduleError("BAD_CRON", `The cron expression ${JSON.stringify(source)} is not correct: ${message}`);
}

/** The value of one token of a field: a number or a name. */
function valueOf(token: string, spec: FieldSpec, source: string): number {
  if (/^\d+$/.test(token)) {
    const value = Number(token);
    if (value < spec.min || value > spec.max) fail(source, `${token} is out of the ${spec.name} range ${spec.min}-${spec.max}`);
    return value;
  }
  const index = spec.names?.indexOf(token.toLowerCase()) ?? -1;
  if (index < 0) fail(source, `${JSON.stringify(token)} is not a ${spec.name}`);
  return index + (spec.first ?? 0);
}

/** The values of one field. */
function parseField(text: string, spec: FieldSpec, source: string): Set<number> {
  const values = new Set<number>();
  for (const part of text.split(",")) {
    if (part === "") fail(source, `the ${spec.name} field has an empty part`);
    const pieces = part.split("/");
    if (pieces.length > 2) fail(source, `${JSON.stringify(part)} has more than one step`);
    const [range, stepText] = pieces as [string, string | undefined];
    let step = 1;
    if (stepText !== undefined) {
      if (!/^\d+$/.test(stepText) || Number(stepText) < 1) fail(source, `the step ${JSON.stringify(stepText)} must be a whole number of 1 or more`);
      step = Number(stepText);
    }
    let low: number;
    let high: number;
    if (range === "*") {
      low = spec.min;
      // The day of the week: * is 0-6, not 0-7
      high = spec.names === DAYS ? 6 : spec.max;
    } else if (range.includes("-")) {
      const bounds = range.split("-");
      if (bounds.length !== 2) fail(source, `${JSON.stringify(range)} is not a range`);
      low = valueOf(bounds[0]!, spec, source);
      high = valueOf(bounds[1]!, spec, source);
      if (low > high) fail(source, `the range ${range} goes down`);
    } else {
      low = valueOf(range, spec, source);
      high = stepText === undefined ? low : spec.max;
    }
    for (let value = low; value <= high; value += step) values.add(spec.names === DAYS && value === 7 ? 0 : value);
  }
  return values;
}

/** This function parses a cron expression. It throws a `BAD_CRON` error that tells the problem. */
export function parseCron(text: string): CronExpression {
  const source = text.trim();
  const expanded = source.startsWith("@") ? CRON_NAMES[source.toLowerCase()] : source;
  if (expanded === undefined) fail(source, `${source} is not a known name (${Object.keys(CRON_NAMES).join(", ")})`);
  const fields = expanded.split(/\s+/).filter((field) => field !== "");
  if (fields.length !== 5) fail(source, `it has ${fields.length} fields, and a cron expression has 5: minute, hour, day of the month, month, day of the week`);
  const [minutes, hours, days, months, weekdays] = fields.map((field, index) => parseField(field, FIELDS[index]!, source)) as [Set<number>, Set<number>, Set<number>, Set<number>, Set<number>];
  return {
    source,
    minutes,
    hours,
    days,
    months,
    weekdays,
    dayLimited: !fields[2]!.startsWith("*"),
    weekdayLimited: !fields[4]!.startsWith("*"),
  };
}

/** The fields of a time in a time zone. */
interface Fields {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}

/** The calendar of a time zone: the fields of a time, and the time of fields (which can overflow). */
interface Calendar {
  fields(time: number): Fields;
  make(year: number, month: number, day: number, hour: number, minute: number): number;
}

const UTC: Calendar = {
  fields(time) {
    const date = new Date(time);
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: date.getUTCHours(), minute: date.getUTCMinutes(), weekday: date.getUTCDay() };
  },
  make: (year, month, day, hour, minute) => Date.UTC(year, month - 1, day, hour, minute),
};

const LOCAL: Calendar = {
  fields(time) {
    const date = new Date(time);
    return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), hour: date.getHours(), minute: date.getMinutes(), weekday: date.getDay() };
  },
  make: (year, month, day, hour, minute) => new Date(year, month - 1, day, hour, minute).getTime(),
};

/** The years that a search covers: Feb 29 can be 8 years away (2096 to 2104). */
const SEARCH_YEARS = 9;

/** True when the day of the fields matches the two day fields. */
function dayMatches(cron: CronExpression, fields: Fields): boolean {
  const day = cron.days.has(fields.day);
  const weekday = cron.weekdays.has(fields.weekday);
  if (cron.dayLimited && cron.weekdayLimited) return day || weekday;
  if (cron.dayLimited) return day;
  if (cron.weekdayLimited) return weekday;
  return true;
}

/**
 * This function gives the first time of the expression after `after` (milliseconds since 1970),
 * or undefined when the expression has no time in the next 9 years.
 */
export function nextTime(cron: CronExpression, after: number, timeZone: ScheduleTimeZone = "local"): number | undefined {
  const calendar = timeZone === "utc" ? UTC : LOCAL;
  let time = Math.floor(after / 60_000) * 60_000 + 60_000;
  const lastYear = calendar.fields(after).year + SEARCH_YEARS;
  for (let step = 0; step < 1_000_000; step++) {
    const fields = calendar.fields(time);
    if (fields.year > lastYear) return undefined;
    let next: number;
    if (!cron.months.has(fields.month)) next = calendar.make(fields.year, fields.month + 1, 1, 0, 0);
    else if (!dayMatches(cron, fields)) next = calendar.make(fields.year, fields.month, fields.day + 1, 0, 0);
    else if (!cron.hours.has(fields.hour)) next = calendar.make(fields.year, fields.month, fields.day, fields.hour + 1, 0);
    else if (!cron.minutes.has(fields.minute)) next = time + 60_000;
    else return time;
    // A change of the clock can give a time that is not later: go one minute on
    time = next > time ? next : time + 60_000;
  }
  return undefined;
}

/** This function gives the next `count` times of the expression after `after`. */
export function nextTimes(cron: CronExpression, after: number, count: number, timeZone: ScheduleTimeZone = "local"): number[] {
  const times: number[] = [];
  let from = after;
  while (times.length < count) {
    const time = nextTime(cron, from, timeZone);
    if (time === undefined) break;
    times.push(time);
    from = time;
  }
  return times;
}

const pad = (value: number, length = 2): string => String(value).padStart(length, "0");

/** The ISO text of a time in a time zone: `2026-10-17T09:00:00Z`, or with the offset of the host: `2026-10-17T09:00:00+02:00`. */
export function formatTime(time: number, timeZone: ScheduleTimeZone = "local"): string {
  const date = new Date(time);
  if (timeZone === "utc") return `${date.toISOString().slice(0, 19)}Z`;
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const zone = offset === 0 ? "Z" : `${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${zone}`;
}
