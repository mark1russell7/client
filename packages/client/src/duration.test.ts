/**
 * Typed durations (roadmap R11): the constructors, the conversion to milliseconds, and the
 * refusal of a value that is not a time.
 */

import { describe, it, expect } from "vitest";
import { hours, isDuration, minutes, ms, optionalMs, seconds, toMs, type Duration } from "./duration.js";
import { createOverallTimeoutMiddleware } from "./client/middleware/timeout.js";

describe("durations", () => {
  it("convert to milliseconds", () => {
    expect(toMs(ms(250))).toBe(250);
    expect(toMs(seconds(1.5))).toBe(1500);
    expect(toMs(minutes(2))).toBe(120_000);
    expect(toMs(hours(1))).toBe(3_600_000);
    expect(optionalMs(undefined)).toBeUndefined();
  });

  it("are quantities with a time unit", () => {
    expect(seconds(2)).toEqual({ value: 2, unit: "s" });
    expect(isDuration(ms(5))).toBe(true);
    expect(isDuration(5)).toBe(false);
    expect(isDuration({ value: 5, unit: "kg" })).toBe(false);
  });

  it("refuse a plain number or another kind of quantity, and name the option", () => {
    expect(() => toMs(5000 as unknown as Duration, "overall")).toThrow(/overall must be a duration/);
    expect(() => toMs({ value: 5, unit: "kg" } as unknown as Duration, "ttl")).toThrow(/ttl must be a duration/);
    // JavaScript callers do not have the type: the option fails when it is read
    expect(() => createOverallTimeoutMiddleware({ overall: 5000 as unknown as Duration })).toThrow(/overall must be a duration/);
  });
});
