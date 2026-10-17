import { describe, expect, it } from "vitest";
import { localTime, weekdayName, weekdayOf } from "./index.js";

const NY = "America/New_York";

describe("localTime", () => {
  it("gives the clock time of an instant in a zone, on 24 hours, 00:00 at midnight", () => {
    expect(localTime("2026-07-04T19:05:00Z", NY)).toBe("15:05");
    expect(localTime("2026-01-15T05:00:00Z", NY)).toBe("00:00");
    expect(localTime(Date.parse("2026-10-17T04:30:59Z"), NY)).toBe("00:30");
    expect(localTime(new Date("2026-10-17T12:00:00Z"), "Asia/Kolkata")).toBe("17:30");
  });

  it("follows the zone over a change of daylight saving time", () => {
    expect(localTime("2026-03-08T06:59:00Z", NY)).toBe("01:59");
    expect(localTime("2026-03-08T07:00:00Z", NY)).toBe("03:00");
    expect(localTime("2026-11-01T05:30:00Z", NY)).toBe("01:30");
    expect(localTime("2026-11-01T06:30:00Z", NY)).toBe("01:30");
  });

  it("refuses an instant that is not valid and a zone that Intl does not know", () => {
    expect(() => localTime("yesterday", NY)).toThrow(RangeError);
    expect(() => localTime(0, "Mars/Olympus")).toThrow(RangeError);
  });
});

describe("weekdayOf and weekdayName", () => {
  it("gives the day of the week of a date, 0 for Sunday", () => {
    expect(weekdayOf("2026-10-18")).toBe(0);
    expect(weekdayOf("2026-10-17")).toBe(6);
    expect(weekdayOf("2000-02-29")).toBe(2);
  });

  it("names the day, in English by default, and refuses a date that is not real", () => {
    expect(weekdayName("2026-10-19")).toBe("Monday");
    expect(weekdayName("2026-10-19", { style: "short" })).toBe("Mon");
    expect(weekdayName("2026-10-19", { locale: "de-DE" })).toBe("Montag");
    expect(() => weekdayName("2026-02-30")).toThrow(RangeError);
  });
});
