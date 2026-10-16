/**
 * Typed durations (roadmap R11).
 *
 * Each public option of this package that is a time takes a `Duration`: a quantity of
 * `@mark1russell7/quantity` with a time unit. A plain number is a type error, so `timeout: 5`
 * cannot mean five milliseconds in one place and five seconds in another. The wire keeps
 * milliseconds (`procedure-timeout`), and the internals convert each duration one time, when an
 * option is read.
 *
 * `@mark1russell7/quantity` has no `Duration` type yet. This alias narrows its `Quantity` to the
 * time units, so the type also refuses `{ value: 5, unit: "kg" }`.
 */

import { quantity, valueIn, type Quantity } from "@mark1russell7/quantity";

/** The canonical time units of `@mark1russell7/quantity` that a duration of this package uses. */
export type TimeUnit = "ns" | "us" | "ms" | "s" | "min" | "h" | "d";

/** A time: a quantity with a time unit. */
export type Duration = Quantity & { readonly unit: TimeUnit };

const TIME_UNITS: ReadonlySet<string> = new Set<TimeUnit>(["ns", "us", "ms", "s", "min", "h", "d"]);

/** This function makes a duration of milliseconds. */
export const ms = (value: number): Duration => quantity(value, "ms") as Duration;
/** This function makes a duration of seconds. */
export const seconds = (value: number): Duration => quantity(value, "s") as Duration;
/** This function makes a duration of minutes. */
export const minutes = (value: number): Duration => quantity(value, "min") as Duration;
/** This function makes a duration of hours. */
export const hours = (value: number): Duration => quantity(value, "h") as Duration;

/** True when a value is a duration: a finite number with a time unit. */
export function isDuration(value: unknown): value is Duration {
  if (value === null || typeof value !== "object") return false;
  const { value: amount, unit } = value as { value?: unknown; unit?: unknown };
  return typeof amount === "number" && Number.isFinite(amount) && typeof unit === "string" && TIME_UNITS.has(unit);
}

/**
 * The number of milliseconds of a duration. A value that is not a duration (a plain number, or
 * a quantity of another kind) throws a `TypeError` that names the option.
 */
export function toMs(duration: Duration, option = "duration"): number {
  if (!isDuration(duration)) {
    throw new TypeError(
      `${option} must be a duration such as ms(500) or seconds(2), got ${JSON.stringify(duration)}. Plain numbers are not durations (roadmap R11).`,
    );
  }
  return valueIn(duration, "ms");
}

/** The milliseconds of an optional duration, or undefined. */
export function optionalMs(duration: Duration | undefined, option?: string): number | undefined {
  return duration === undefined ? undefined : toMs(duration, option);
}
