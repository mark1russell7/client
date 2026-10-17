/**
 * Wall times and dates in IANA time zones, with `Intl` only and no time zone database. This is the
 * approach of `@procedures/schedule`: the offset of a zone at a time comes from `formatToParts`.
 *
 * A wall time is the time that a clock shows, as milliseconds with the arithmetic of UTC. In a
 * zone, the wall time of an instant is the instant plus the offset of the zone at that instant.
 */

import { dateTime } from "./days.js";

const MINUTE = 60_000;
const DAY = 86_400_000;

/** The fields of a wall time. The year is astronomical: 1 BC is the year 0. */
interface WallFields {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

/** The formatters by the name of the zone. */
const formats = new Map<string, Intl.DateTimeFormat>();

/** The formatter of a zone. `Intl` throws a `RangeError` for a zone that it does not know. */
function formatOf(timeZone: string): Intl.DateTimeFormat {
  let format = formats.get(timeZone);
  if (format === undefined) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      era: "short",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    // The cache stays small: a process uses few zones
    if (formats.size >= 1000) formats.clear();
    formats.set(timeZone, format);
  }
  return format;
}

/** The fields of the wall time of an instant in a zone. */
function fieldsAt(time: number, timeZone: string): WallFields {
  const value: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const part of formatOf(timeZone).formatToParts(time)) if (part.type !== "literal") value[part.type] = part.value;
  const year = Number(value.year);
  return {
    year: value.era === "BC" ? 1 - year : year,
    month: Number(value.month),
    day: Number(value.day),
    hour: Number(value.hour) % 24,
    minute: Number(value.minute),
    second: Number(value.second),
  };
}

/** The wall time of the fields. `setUTCFullYear` keeps the years 0 to 99, which `Date.UTC` moves to 1900. */
function wallOf(fields: WallFields): number {
  const date = new Date(0);
  date.setUTCFullYear(fields.year, fields.month - 1, fields.day);
  date.setUTCHours(fields.hour, fields.minute, fields.second, 0);
  return date.getTime();
}

/** The offset of a zone at an instant: the wall time minus the instant, in milliseconds. */
function offsetAt(time: number, timeZone: string): number {
  return wallOf(fieldsAt(time, timeZone)) - Math.floor(time / 1000) * 1000;
}

/**
 * This function gives the instant of a wall time in a zone, as RFC 5545 (3.3.5) tells. A wall
 * time that the clock shows two times gives its first occurrence. A wall time in a gap uses the
 * offset before the gap: 02:30 on the day of the change to daylight time becomes 03:30.
 */
export function zonedInstant(wall: number, timeZone: string): number {
  // The offsets a day before and a day after: a change of the clock near the wall time is between them
  const before = offsetAt(wall - DAY, timeZone);
  const after = offsetAt(wall + DAY, timeZone);
  const offsets = new Set([before, after, offsetAt(wall, timeZone)]);
  const times = [...offsets].map((offset) => wall - offset).filter((time) => time + offsetAt(time, timeZone) === wall);
  return times.length > 0 ? Math.min(...times) : wall - before;
}

/** The form of a time of day: `HH:MM` or `HH:MM:SS`. */
const TIME = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

const pad = (value: number, size = 2): string => String(value).padStart(size, "0");

/**
 * This function gives the UTC offset (`+HH:MM` or `-HH:MM`) of a wall time in an IANA time zone.
 * The text `${date}T${time}${offset}` is then the instant that RFC 5545 gives to the wall time.
 *
 * - The date is `YYYY-MM-DD`, and the time is `HH:MM` or `HH:MM:SS`. Another text throws a `RangeError`.
 * - A wall time that the clock shows two times gives the offset of its first occurrence.
 * - A wall time in a gap gives the offset before the gap, so `02:30-05:00` is 03:30 daylight time.
 * - UTC gives `+00:00`. A zone that `Intl` does not know throws a `RangeError`.
 */
export function zonedOffset(date: string, time: string, timeZone: string): string {
  const match = TIME.exec(time);
  if (match === null) throw new RangeError(`zonedOffset: ${JSON.stringify(time)} is not a time in the form HH:MM or HH:MM:SS`);
  const wall = dateTime(date, "zonedOffset") + (Number(match[1]) * 60 + Number(match[2])) * MINUTE + Number(match[3] ?? 0) * 1000;
  const minutes = Math.round((wall - zonedInstant(wall, timeZone)) / MINUTE);
  const sign = minutes < 0 ? "-" : "+";
  return `${sign}${pad(Math.floor(Math.abs(minutes) / 60))}:${pad(Math.abs(minutes) % 60)}`;
}

/**
 * This function gives the date (`YYYY-MM-DD`) of an instant in an IANA time zone. The instant is
 * a `Date`, milliseconds since 1970, or a text that `Date.parse` reads.
 *
 * - The result is the date that a clock in the zone shows at the instant.
 * - An instant that is not valid, or a year of the result after 9999, throws a `RangeError`.
 * - A zone that `Intl` does not know throws a `RangeError`.
 */
export function localDate(instant: Date | number | string, timeZone: string): string {
  const time = instant instanceof Date ? instant.getTime() : typeof instant === "number" ? instant : Date.parse(instant);
  if (!Number.isFinite(time)) throw new RangeError(`localDate: ${JSON.stringify(String(instant))} is not a valid instant`);
  const fields = fieldsAt(time, timeZone);
  if (fields.year < 0 || fields.year > 9999) throw new RangeError(`localDate: the year ${fields.year} is not from 0 to 9999`);
  return `${pad(fields.year, 4)}-${pad(fields.month)}-${pad(fields.day)}`;
}

/**
 * This function gives the time (`HH:MM`, 24 hours, `00:00` at midnight) that a clock in an IANA
 * time zone shows at an instant. The seconds are cut, not rounded. The instant is a `Date`,
 * milliseconds since 1970, or a text that `Date.parse` reads. An instant that is not valid, or a
 * zone that `Intl` does not know, throws a `RangeError`.
 */
export function localTime(instant: Date | number | string, timeZone: string): string {
  const time = instant instanceof Date ? instant.getTime() : typeof instant === "number" ? instant : Date.parse(instant);
  if (!Number.isFinite(time)) throw new RangeError(`localTime: ${JSON.stringify(String(instant))} is not a valid instant`);
  const fields = fieldsAt(time, timeZone);
  return `${pad(fields.hour)}:${pad(fields.minute)}`;
}
