/**
 * The calendar days: the date of an instant in a zone, the offset of a wall time, and the
 * arithmetic of dates. The expected values are fixed: they include changes of daylight saving
 * time and zones far from UTC.
 */

import { describe, expect, it } from "vitest";
import { daysBetween, shiftDay, shiftMonth } from "./days.js";
import { localDate, zonedOffset } from "./zone.js";

const NY = "America/New_York";

/**
 * The time limit of the test that compares each quarter hour of a year. The work of the test is
 * fixed: in CI, it took up to 4.5 s, near the default of vitest (5 s).
 */
const YEAR_SCAN_TIMEOUT_MS = 30_000;

describe("localDate", () => {
  it("gives the date of an instant in a zone, from a text, a number or a Date", () => {
    expect(localDate("2026-10-17T03:00:00Z", NY)).toBe("2026-10-16");
    expect(localDate("2026-10-17T04:00:00Z", NY)).toBe("2026-10-17");
    expect(localDate(Date.UTC(2026, 9, 17, 3), NY)).toBe("2026-10-16");
    expect(localDate(new Date("2026-10-17T03:00:00Z"), "UTC")).toBe("2026-10-17");
    expect(localDate("2026-10-16T23:00:00-04:00", "Asia/Kolkata")).toBe("2026-10-17");
  });

  it("changes the date at local midnight on both sides of a change of daylight saving time", () => {
    // Before the change to daylight time, midnight is at 05:00 UTC. After the change back, at 04:00 UTC before it
    expect(localDate("2026-03-08T04:59:59Z", NY)).toBe("2026-03-07");
    expect(localDate("2026-03-08T05:00:00Z", NY)).toBe("2026-03-08");
    expect(localDate("2026-03-09T03:59:59Z", NY)).toBe("2026-03-08");
    expect(localDate("2026-03-09T04:00:00Z", NY)).toBe("2026-03-09");
    expect(localDate("2026-11-01T03:59:59Z", NY)).toBe("2026-10-31");
    expect(localDate("2026-11-01T04:00:00Z", NY)).toBe("2026-11-01");
    expect(localDate("2026-11-02T04:59:59Z", NY)).toBe("2026-11-01");
    expect(localDate("2026-11-02T05:00:00Z", NY)).toBe("2026-11-02");
  });

  it("knows the zones far from UTC and a day that a zone skipped", () => {
    // UTC+14 and UTC-11: the same instant has dates two days apart
    expect(localDate("2026-10-17T09:59:59Z", "Pacific/Kiritimati")).toBe("2026-10-17");
    expect(localDate("2026-10-17T10:00:00Z", "Pacific/Kiritimati")).toBe("2026-10-18");
    expect(localDate("2026-10-17T10:59:59Z", "Pacific/Pago_Pago")).toBe("2026-10-16");
    expect(localDate("2026-10-17T11:00:00Z", "Pacific/Pago_Pago")).toBe("2026-10-17");
    // Samoa went from UTC-10 to UTC+14 at the end of 2011-12-29, so its calendar has no 2011-12-30
    expect(localDate("2011-12-30T09:59:59Z", "Pacific/Apia")).toBe("2011-12-29");
    expect(localDate("2011-12-30T10:00:00Z", "Pacific/Apia")).toBe("2011-12-31");
    expect(localDate("2026-10-17T18:14:59Z", "Asia/Kathmandu")).toBe("2026-10-17");
    expect(localDate("2026-10-17T18:15:00Z", "Asia/Kathmandu")).toBe("2026-10-18");
  });

  it("gives the result of the en-CA format of Intl at each quarter hour of a year", { timeout: YEAR_SCAN_TIMEOUT_MS }, () => {
    for (const zone of [NY, "Europe/Berlin", "Australia/Lord_Howe", "Pacific/Kiritimati"]) {
      const format = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
      for (let time = Date.UTC(2026, 0, 1); time < Date.UTC(2027, 0, 1); time += 900_000) {
        if (localDate(time, zone) !== format.format(time)) expect.fail(`${zone} ${new Date(time).toISOString()}`);
      }
    }
  });

  it("pads the year to four digits", () => {
    expect(localDate("0099-06-01T12:00:00Z", "UTC")).toBe("0099-06-01");
    expect(localDate("0000-06-01T12:00:00Z", "UTC")).toBe("0000-06-01");
  });

  it("throws a RangeError for an instant that is not valid, a zone that Intl does not know, and a year after 9999", () => {
    expect(() => localDate("not a time", NY)).toThrow(RangeError);
    expect(() => localDate(Number.NaN, NY)).toThrow(RangeError);
    expect(() => localDate("2026-10-17T00:00:00Z", "Nowhere/Nothing")).toThrow(RangeError);
    expect(() => localDate("+010000-01-01T00:00:00Z", "UTC")).toThrow(/the year 10000/);
  });
});

describe("zonedOffset", () => {
  it("gives the offset of a wall time on each side of a change", () => {
    expect(zonedOffset("2026-07-04", "15:00", NY)).toBe("-04:00");
    expect(zonedOffset("2026-01-15", "15:00", NY)).toBe("-05:00");
    expect(zonedOffset("2026-11-01", "00:30", NY)).toBe("-04:00");
    expect(zonedOffset("2026-11-01", "15:00", NY)).toBe("-05:00");
    expect(zonedOffset("2026-03-08", "01:59", NY)).toBe("-05:00");
    expect(zonedOffset("2026-03-08", "03:00", NY)).toBe("-04:00");
    expect(zonedOffset("2026-07-04", "12:00", "UTC")).toBe("+00:00");
    expect(zonedOffset("2026-10-17", "12:00:30", "Asia/Kathmandu")).toBe("+05:45");
    expect(zonedOffset("2026-10-17", "12:00", "Pacific/Kiritimati")).toBe("+14:00");
    expect(zonedOffset("2026-10-17", "12:00", "Pacific/Pago_Pago")).toBe("-11:00");
  });

  it("gives the first occurrence of a wall time that occurs two times (RFC 5545)", () => {
    expect(zonedOffset("2026-11-01", "01:30", NY)).toBe("-04:00");
    expect(zonedOffset("2026-10-25", "02:30", "Europe/Berlin")).toBe("+02:00");
    // Lord Howe Island changes its clock by 30 minutes
    expect(zonedOffset("2026-04-05", "01:45", "Australia/Lord_Howe")).toBe("+11:00");
  });

  it("gives the offset before the gap for a wall time that does not occur (RFC 5545)", () => {
    // 02:30-05:00 is 07:30 UTC: 03:30 daylight time
    expect(zonedOffset("2026-03-08", "02:30", NY)).toBe("-05:00");
    expect(zonedOffset("2026-03-29", "02:30", "Europe/Berlin")).toBe("+01:00");
    expect(zonedOffset("2026-10-04", "02:15", "Australia/Lord_Howe")).toBe("+10:30");
  });

  it("gives an offset that gives the wall time again, outside a gap", () => {
    for (let minute = 0; minute < 1440; minute += 15) {
      const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
      for (const [date, zone] of [["2026-11-01", NY], ["2026-10-25", "Europe/Berlin"]] as const) {
        const instant = Date.parse(`${date}T${time}:00${zonedOffset(date, time, zone)}`);
        expect(localDate(instant, zone)).toBe(date);
      }
    }
  });

  it("throws a RangeError for a date or a time that is not valid", () => {
    expect(() => zonedOffset("2026-02-30", "12:00", NY)).toThrow(RangeError);
    expect(() => zonedOffset("2026-10-17", "24:00", NY)).toThrow(RangeError);
    expect(() => zonedOffset("2026-10-17", "9:00", NY)).toThrow(RangeError);
    expect(() => zonedOffset("2026-10-17", "12:00", "Nowhere/Nothing")).toThrow(RangeError);
  });
});

describe("shiftDay", () => {
  it("adds and removes days across a month, a year, a leap day and a change of daylight saving time", () => {
    expect(shiftDay("2026-03-07", 1)).toBe("2026-03-08");
    expect(shiftDay("2026-03-08", 1)).toBe("2026-03-09");
    expect(shiftDay("2026-11-01", 1)).toBe("2026-11-02");
    expect(shiftDay("2026-03-09", -2)).toBe("2026-03-07");
    expect(shiftDay("2024-02-28", 1)).toBe("2024-02-29");
    expect(shiftDay("2026-02-28", 1)).toBe("2026-03-01");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDay("2026-10-17", 0)).toBe("2026-10-17");
    expect(shiftDay("2026-10-17", -365)).toBe("2025-10-17");
  });

  it("throws a RangeError for a date that is not valid, a number of days that is not an integer, and a year after 9999", () => {
    expect(() => shiftDay("2026-02-30", 1)).toThrow(RangeError);
    expect(() => shiftDay("2026-10-17T00:00:00Z", 1)).toThrow(RangeError);
    expect(() => shiftDay("2026-10-17", 0.5)).toThrow(RangeError);
    expect(() => shiftDay("9999-12-31", 1)).toThrow(RangeError);
  });
});

describe("shiftMonth", () => {
  it("adds and removes months across a year", () => {
    expect(shiftMonth("2026-10-17", 1)).toBe("2026-11-17");
    expect(shiftMonth("2026-10-17", 3)).toBe("2027-01-17");
    expect(shiftMonth("2026-01-15", -1)).toBe("2025-12-15");
    expect(shiftMonth("2026-10-17", -22)).toBe("2024-12-17");
    expect(shiftMonth("2026-10-17", 0)).toBe("2026-10-17");
    expect(shiftMonth("2026-10-17", 120)).toBe("2036-10-17");
  });

  it("gives the last day of the month when the day is not in it", () => {
    expect(shiftMonth("2026-01-31", 1)).toBe("2026-02-28");
    expect(shiftMonth("2024-01-31", 1)).toBe("2024-02-29");
    expect(shiftMonth("2024-02-29", 12)).toBe("2025-02-28");
    expect(shiftMonth("2026-03-31", -1)).toBe("2026-02-28");
    expect(shiftMonth("2026-05-31", 1)).toBe("2026-06-30");
    expect(shiftMonth("2000-01-30", 1)).toBe("2000-02-29");
    expect(shiftMonth("1900-01-30", 1)).toBe("1900-02-28");
  });

  it("gives the arithmetic of Date.UTC with shiftDay from the 1st", () => {
    for (const [year, month, day, months] of [
      [2026, 1, 31, 1],
      [2026, 8, 31, 3],
      [2024, 2, 29, 12],
      [2026, 12, 31, -10],
    ] as const) {
      const first = `${String(year)}-${String(month).padStart(2, "0")}-01`;
      expect(shiftDay(shiftMonth(first, months), day - 1)).toBe(new Date(Date.UTC(year, month - 1 + months, day)).toISOString().slice(0, 10));
    }
  });

  it("keeps the years 0000 to 9999", () => {
    expect(shiftMonth("0000-02-29", 0)).toBe("0000-02-29");
    expect(shiftMonth("0001-01-31", -12)).toBe("0000-01-31");
    expect(shiftMonth("9999-11-30", 1)).toBe("9999-12-30");
    expect(() => shiftMonth("9999-12-31", 1)).toThrow(RangeError);
    expect(() => shiftMonth("0000-01-01", -1)).toThrow(RangeError);
  });

  it("throws a RangeError for a date that is not valid and a number of months that is not an integer", () => {
    expect(() => shiftMonth("2026-02-30", 1)).toThrow(RangeError);
    expect(() => shiftMonth("2026-10", 1)).toThrow(RangeError);
    expect(() => shiftMonth("2026-10-17", 1.5)).toThrow(RangeError);
    expect(() => shiftMonth("2026-10-17", Number.NaN)).toThrow(RangeError);
  });
});

describe("daysBetween", () => {
  it("counts the whole days from one date to another", () => {
    expect(daysBetween("2026-03-01", "2026-04-01")).toBe(31);
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2);
    expect(daysBetween("2026-11-02", "2026-10-31")).toBe(-2);
    expect(daysBetween("2024-01-01", "2025-01-01")).toBe(366);
    expect(daysBetween("2026-10-17", "2026-10-17")).toBe(0);
    expect(daysBetween("2026-10-17", shiftDay("2026-10-17", 1000))).toBe(1000);
  });

  it("throws a RangeError for a text that is not a date", () => {
    expect(() => daysBetween("2026-10", "2026-10-17")).toThrow(RangeError);
    expect(() => daysBetween("2026-10-17", "2026-13-01")).toThrow(RangeError);
  });
});
