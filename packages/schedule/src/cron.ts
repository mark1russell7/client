/**
 * Cron expressions (roadmap R46): the parse and the next times.
 *
 * This package parses cron itself. The format is small, and `Intl` gives the offsets of each time
 * zone. A dependency gives a time zone database or a second format that this package does not need.
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
 * The time zone is `utc`, `local` (the time zone of the host) or an IANA name, for example
 * `Europe/Berlin`. The changes of daylight saving time follow Vixie cron:
 *
 * - A fixed time has no `*` at the start of its minute field and of its hour field: `30 2 * * *`.
 * - A fixed time in the hour that does not exist runs once, at the first minute after the change.
 *   Two such times of one expression give one run.
 * - A fixed time in the hour that occurs twice runs once, at its first occurrence.
 * - An expression with `*` at the start of its minute field or of its hour field follows the
 *   clock. It has no run for a time that does not exist, and it runs at the two occurrences of a
 *   time that occurs twice. Thus `0 * * * *` runs each hour of real time.
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
  /**
   * True when the minute field and the hour field do not start with `*`. A fixed time obeys the
   * rules of Vixie cron for the changes of daylight saving time (see the comment of the file).
   */
  readonly fixedTime: boolean;
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
    fixedTime: !fields[0]!.startsWith("*") && !fields[1]!.startsWith("*"),
  };
}

// =============================================================================
// Time zones
// =============================================================================

const MINUTE = 60_000;
const DAY = 86_400_000;

/** The form of an IANA name: `Europe/Berlin`, `UTC`, `Etc/GMT+5`. An offset such as `+05:30` is not one. */
const IANA_NAME = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/;

/** The names that `checkTimeZone` accepted, with its result: a file store examines each schedule at each read. */
const checked = new Map<string, string>();

/**
 * This function checks a time zone and gives its name: `utc`, `local`, or an IANA name that `Intl`
 * knows. A name that differs from the name of `Intl` only by the case gets the case of `Intl`. The
 * function throws a `BAD_TIME_ZONE` error for another name.
 */
export function checkTimeZone(timeZone: string): ScheduleTimeZone {
  if (timeZone === "utc" || timeZone === "local") return timeZone;
  const known = checked.get(timeZone);
  if (known !== undefined) return known;
  let resolved: string | undefined;
  if (timeZone.length <= 100 && IANA_NAME.test(timeZone)) {
    try {
      resolved = new Intl.DateTimeFormat("en-US", { timeZone }).resolvedOptions().timeZone;
    } catch {
      resolved = undefined;
    }
  }
  if (resolved === undefined) {
    throw new ScheduleError("BAD_TIME_ZONE", `The time zone ${JSON.stringify(timeZone)} is not utc, local or an IANA name that Intl knows, for example Europe/Berlin`);
  }
  const name = resolved.toLowerCase() === timeZone.toLowerCase() ? resolved : timeZone;
  // The cache stays small: a process uses few zones
  if (checked.size >= 1000) checked.clear();
  checked.set(timeZone, name);
  return name;
}

/** This function gives the IANA name of the time zone of the process, from `Intl`. */
export function hostTimeZone(): string {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** The offsets of one time zone of `Intl`. */
class Zone {
  private readonly format: Intl.DateTimeFormat;

  constructor(name: string) {
    this.format = new Intl.DateTimeFormat("en-US", {
      timeZone: name,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
  }

  /** This method gives the offset of the zone at a time: the wall time minus the time, in milliseconds. */
  offset(time: number): number {
    const value: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {};
    for (const part of this.format.formatToParts(time)) if (part.type !== "literal") value[part.type] = Number(part.value);
    const wall = Date.UTC(value.year ?? 1970, (value.month ?? 1) - 1, value.day ?? 1, (value.hour ?? 0) % 24, value.minute ?? 0, value.second ?? 0);
    return wall - Math.floor(time / 1000) * 1000;
  }
}

/** The zones, by the name in lower case: `Intl` ignores the case of a name. */
const zones = new Map<string, Zone>();

/** The zone of a name. It throws `BAD_TIME_ZONE` for a name that `Intl` does not know. */
function zoneOf(timeZone: string): Zone {
  const key = timeZone.toLowerCase();
  let zone = zones.get(key);
  if (zone === undefined) {
    zone = new Zone(checkTimeZone(timeZone));
    zones.set(key, zone);
  }
  return zone;
}

/** The IANA name of a time zone that is not `utc`: `local` is the time zone of the host. */
const ianaName = (timeZone: ScheduleTimeZone): string => (timeZone === "local" ? hostTimeZone() : timeZone);

// =============================================================================
// Wall times
// =============================================================================

/**
 * A wall time is the time that a clock shows, as milliseconds with the arithmetic of UTC: the
 * fields of `new Date(wall)` in UTC are the fields of the clock. A time is a real time. In a zone,
 * the wall time of a time is the time plus the offset of the zone at that time.
 */
interface Fields {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}

function fieldsOf(wall: number): Fields {
  const date = new Date(wall);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: date.getUTCHours(), minute: date.getUTCMinutes(), weekday: date.getUTCDay() };
}

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
 * This function gives the first wall time of the expression after the wall time `after` (a whole
 * minute), or undefined when the expression has no wall time in the next 9 years.
 */
function nextWall(cron: CronExpression, after: number): number | undefined {
  let wall = after + MINUTE;
  const lastYear = fieldsOf(after).year + SEARCH_YEARS;
  for (let step = 0; step < 1_000_000; step++) {
    const fields = fieldsOf(wall);
    if (fields.year > lastYear) return undefined;
    if (!cron.months.has(fields.month)) wall = Date.UTC(fields.year, fields.month, 1);
    else if (!dayMatches(cron, fields)) wall = Date.UTC(fields.year, fields.month - 1, fields.day + 1);
    else if (!cron.hours.has(fields.hour)) wall = Date.UTC(fields.year, fields.month - 1, fields.day, fields.hour + 1);
    else if (!cron.minutes.has(fields.minute)) wall += MINUTE;
    else return wall;
  }
  return undefined;
}

/**
 * This function gives the first minute in `(from, to]` with another offset than `from`. The
 * offsets of `from` and `to` differ, and one change of the offset is between them.
 */
function changeIn(zone: Zone, from: number, to: number): number {
  const offset = zone.offset(from);
  let low = from;
  let high = to;
  while (high - low > MINUTE) {
    const middle = low + Math.floor((high - low) / 2 / MINUTE) * MINUTE;
    if (zone.offset(middle) === offset) low = middle;
    else high = middle;
  }
  return high;
}

/**
 * The times of a wall time, sorted: one time, two times in the hour that occurs twice, or none in
 * the hour that does not exist. For none, `change` is the time of the change: its wall time is
 * the first wall time after the gap.
 */
function timesOf(zone: Zone, wall: number): { times: number[]; change?: number } {
  // The offsets a day before and a day after: a change of the clock near the wall time is between them
  const before = zone.offset(wall - DAY);
  const after = zone.offset(wall + DAY);
  const times = [...new Set([wall - before, wall - after])].filter((time) => time + zone.offset(time) === wall).sort((a, b) => a - b);
  if (times.length > 0 || before >= after) return { times };
  return { times, change: changeIn(zone, wall - after, wall - before) };
}

/**
 * The highest wall time of the minutes up to the minute `time`. After a change back, the clock
 * shows an hour a second time, and this wall time stays above the wall time of `time`.
 */
function highWall(zone: Zone, time: number): number {
  const offset = zone.offset(time);
  const earlier = zone.offset(time - DAY);
  if (earlier <= offset) return time + offset;
  const change = changeIn(zone, time - DAY, time);
  return Math.max(time + offset, change - MINUTE + earlier);
}

/**
 * The next time of a fixed time after the minute `after`. Each wall time runs at the first time
 * whose wall time is the same or later. Thus a wall time in a gap runs at the change, and a wall
 * time that occurs twice runs at its first occurrence. The wall times after the highest wall time
 * of `after` are the wall times that did not run.
 */
function nextFixed(cron: CronExpression, zone: Zone, after: number): number | undefined {
  let wall = highWall(zone, after);
  for (let step = 0; step < 1000; step++) {
    const next = nextWall(cron, wall);
    if (next === undefined) return undefined;
    const { times, change } = timesOf(zone, next);
    if (times.length > 0) return times[0];
    if (change !== undefined) return change;
    wall = next;
  }
  return undefined;
}

/**
 * The next time of an expression that follows the clock, after the minute `after`: the first time
 * whose wall time matches. A wall time in a gap has no time. A wall time that occurs twice has two.
 */
function nextByClock(cron: CronExpression, zone: Zone, after: number): number | undefined {
  // The first occurrences: the wall times after the highest wall time
  let first: number | undefined;
  let wall = highWall(zone, after);
  for (let step = 0; step < 1000 && first === undefined; step++) {
    const next = nextWall(cron, wall);
    if (next === undefined) break;
    const { times, change } = timesOf(zone, next);
    if (times.length > 0) first = times[0];
    // A wall time in a gap has no time: the search goes on after the gap
    else wall = change === undefined ? next : change + zone.offset(change) - MINUTE;
  }
  const second = secondOccurrence(cron, zone, after);
  if (first === undefined) return second;
  return second === undefined ? first : Math.min(first, second);
}

/**
 * The first time after the minute `after` in the hour that the clock shows a second time, when a
 * change back is near `after`, or undefined.
 */
function secondOccurrence(cron: CronExpression, zone: Zone, after: number): number | undefined {
  const offset = zone.offset(after);
  const earlier = zone.offset(after - DAY);
  const later = zone.offset(after + DAY);
  let change: number;
  let shift: number;
  let repeated: number;
  if (earlier > offset) {
    change = changeIn(zone, after - DAY, after);
    shift = earlier - offset;
    repeated = offset;
  } else if (later < offset) {
    change = changeIn(zone, after, after + DAY);
    shift = offset - later;
    repeated = later;
  } else {
    return undefined;
  }
  // The second occurrences are the times from the change to the end of the shift, with the offset `repeated`
  const end = change + shift;
  const start = Math.max(after + MINUTE, change);
  if (start >= end) return undefined;
  const wall = nextWall(cron, start + repeated - MINUTE);
  if (wall === undefined) return undefined;
  const time = wall - repeated;
  return time < end ? time : undefined;
}

// =============================================================================
// The next times
// =============================================================================

/**
 * This function gives the first time of the expression after `after` (milliseconds since 1970),
 * or undefined when the expression has no time in the next 9 years. The time zone is `utc`,
 * `local` or an IANA name. An unknown name gives a `BAD_TIME_ZONE` error.
 */
export function nextTime(cron: CronExpression, after: number, timeZone: ScheduleTimeZone = "local"): number | undefined {
  const minute = Math.floor(after / MINUTE) * MINUTE;
  if (timeZone === "utc") return nextWall(cron, minute);
  const zone = zoneOf(ianaName(timeZone));
  return cron.fixedTime ? nextFixed(cron, zone, minute) : nextByClock(cron, zone, minute);
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

const pad = (value: number): string => String(value).padStart(2, "0");

/**
 * The ISO text of a time in a time zone: `2026-10-17T09:00:00Z` in UTC, or with the offset of the
 * zone at that time: `2026-10-17T09:00:00+02:00`. An offset of 0 gives `Z`.
 */
export function formatTime(time: number, timeZone: ScheduleTimeZone = "local"): string {
  if (timeZone === "utc") return `${new Date(time).toISOString().slice(0, 19)}Z`;
  const offset = zoneOf(ianaName(timeZone)).offset(time);
  const minutes = Math.round(offset / MINUTE);
  const zone = minutes === 0 ? "Z" : `${minutes > 0 ? "+" : "-"}${pad(Math.floor(Math.abs(minutes) / 60))}:${pad(Math.abs(minutes) % 60)}`;
  return `${new Date(time + offset).toISOString().slice(0, 19)}${zone}`;
}

/**
 * This function gives the time zone of a computation. The zone `local` becomes `local` (the zone
 * of the process) or the zone that the host gives for it.
 */
export function zoneFor(timeZone: ScheduleTimeZone, local: string | undefined): ScheduleTimeZone {
  return timeZone === "local" && local !== undefined ? local : timeZone;
}
