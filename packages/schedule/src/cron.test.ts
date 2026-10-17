/**
 * The cron expressions (roadmap R46): the parse, the errors, the next times in UTC, in local
 * time and in IANA time zones, the two day fields, and the changes of daylight saving time with
 * the rules of Vixie cron. Each time is a fixed date: no test reads the clock of the process.
 */

import { describe, expect, it } from "vitest";
import { checkTimeZone, CRON_NAMES, formatTime, hostTimeZone, nextTime, nextTimes, parseCron, zoneFor } from "./cron.js";
import { ScheduleError } from "./errors.js";

const utc = (text: string): number => Date.parse(text);
const iso = (time: number | undefined): string | undefined => (time === undefined ? undefined : new Date(time).toISOString());
const sorted = (set: ReadonlySet<number>): number[] => [...set].sort((a, b) => a - b);

describe("parseCron", () => {
  it("reads numbers, ranges, steps and lists", () => {
    const cron = parseCron("*/15 0-6/2 1,15,31 * *");
    expect(sorted(cron.minutes)).toEqual([0, 15, 30, 45]);
    expect(sorted(cron.hours)).toEqual([0, 2, 4, 6]);
    expect(sorted(cron.days)).toEqual([1, 15, 31]);
    expect(cron.months.size).toBe(12);
    expect(sorted(cron.weekdays)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(cron.dayLimited).toBe(true);
    expect(cron.weekdayLimited).toBe(false);
    expect(sorted(parseCron("5/20 * * * *").minutes)).toEqual([5, 25, 45]);
    expect(sorted(parseCron("1-10/3,50 * * * *").minutes)).toEqual([1, 4, 7, 10, 50]);
  });

  it("reads the names of the months and of the days in each case, and 7 as Sunday", () => {
    const cron = parseCron("0 9 * JAN,jul-Sep MON-fri");
    expect(sorted(cron.months)).toEqual([1, 7, 8, 9]);
    expect(sorted(cron.weekdays)).toEqual([1, 2, 3, 4, 5]);
    expect(sorted(parseCron("0 0 * * 7").weekdays)).toEqual([0]);
    expect(sorted(parseCron("0 0 * * 5-7").weekdays)).toEqual([0, 5, 6]);
    expect(sorted(parseCron("0 0 * * sun,SAT").weekdays)).toEqual([0, 6]);
  });

  it("reads the names of the expressions", () => {
    for (const [name, fields] of Object.entries(CRON_NAMES)) {
      const a = parseCron(name);
      const b = parseCron(fields);
      expect([sorted(a.minutes), sorted(a.hours), sorted(a.days), sorted(a.months), sorted(a.weekdays)], name).toEqual([
        sorted(b.minutes),
        sorted(b.hours),
        sorted(b.days),
        sorted(b.months),
        sorted(b.weekdays),
      ]);
    }
    expect(parseCron("@DAILY").source).toBe("@DAILY");
  });

  it("counts a field that starts with * as a field without a limit (Vixie cron)", () => {
    const cron = parseCron("0 0 */2 * */2");
    expect(cron.dayLimited).toBe(false);
    expect(cron.weekdayLimited).toBe(false);
  });

  it.each([
    ["* * * *", /4 fields/],
    ["* * * * * *", /6 fields/],
    ["60 * * * *", /out of the minute range 0-59/],
    ["* 24 * * *", /hour range/],
    ["* * 0 * *", /day of the month range 1-31/],
    ["* * * 13 *", /month range/],
    ["* * * * 8", /day of the week range 0-7/],
    ["*/0 * * * *", /step/],
    ["*/x * * * *", /step/],
    ["1/2/3 * * * *", /more than one step/],
    ["5-1 * * * *", /goes down/],
    ["1-2-3 * * * *", /not a range/],
    ["1,,2 * * * *", /empty part/],
    ["* * * foo *", /not a month/],
    ["* * * * fun", /not a day of the week/],
    ["@reboot", /not a known name/],
    ["", /0 fields/],
  ])("refuses %j", (text, message) => {
    let error: unknown;
    try {
      parseCron(text);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ScheduleError);
    expect(error).toMatchObject({ code: "BAD_CRON", message });
  });
});

describe("nextTime in UTC", () => {
  const next = (cron: string, after: string): string | undefined => iso(nextTime(parseCron(cron), utc(after), "utc"));

  it("gives the first time after the minute of the start, never the start itself", () => {
    expect(next("* * * * *", "2026-10-16T12:00:00Z")).toBe("2026-10-16T12:01:00.000Z");
    expect(next("* * * * *", "2026-10-16T12:00:59.999Z")).toBe("2026-10-16T12:01:00.000Z");
    expect(next("*/15 * * * *", "2026-10-16T12:07:00Z")).toBe("2026-10-16T12:15:00.000Z");
    expect(next("*/15 * * * *", "2026-10-16T12:15:00Z")).toBe("2026-10-16T12:30:00.000Z");
    expect(next("0 * * * *", "2026-10-16T23:30:00Z")).toBe("2026-10-17T00:00:00.000Z");
  });

  it("goes to the next day, month and year", () => {
    expect(next("0 9 * * 1-5", "2026-10-16T10:00:00Z")).toBe("2026-10-19T09:00:00.000Z");
    expect(next("0 0 1 * *", "2026-12-15T00:00:00Z")).toBe("2027-01-01T00:00:00.000Z");
    expect(next("30 4 31 * *", "2026-04-01T00:00:00Z")).toBe("2026-05-31T04:30:00.000Z");
    expect(next("@yearly", "2026-10-16T00:00:00Z")).toBe("2027-01-01T00:00:00.000Z");
  });

  it("finds February 29, and gives undefined for a day that never comes", () => {
    expect(next("0 0 29 2 *", "2026-03-01T00:00:00Z")).toBe("2028-02-29T00:00:00.000Z");
    expect(next("0 0 29 2 *", "2096-03-01T00:00:00Z")).toBe("2104-02-29T00:00:00.000Z");
    expect(next("0 0 31 2 *", "2026-01-01T00:00:00Z")).toBeUndefined();
    expect(next("0 0 30 2 *", "2026-01-01T00:00:00Z")).toBeUndefined();
  });

  it("matches a day when one of the two limited day fields matches", () => {
    // The 13th or a Friday: 2026-11-06 is a Friday, 2026-11-13 is a Friday and the 13th
    expect(nextTimes(parseCron("0 0 13 * 5"), utc("2026-11-01T00:00:00Z"), 4, "utc").map(iso)).toEqual([
      "2026-11-06T00:00:00.000Z",
      "2026-11-13T00:00:00.000Z",
      "2026-11-20T00:00:00.000Z",
      "2026-11-27T00:00:00.000Z",
    ]);
    // A day field that starts with *: only the other field decides
    expect(nextTimes(parseCron("0 0 */10 * 1"), utc("2026-11-01T00:00:00Z"), 3, "utc").map(iso)).toEqual([
      "2026-11-02T00:00:00.000Z",
      "2026-11-09T00:00:00.000Z",
      "2026-11-16T00:00:00.000Z",
    ]);
    expect(nextTimes(parseCron("0 0 1,15 * *"), utc("2026-11-01T00:00:00Z"), 2, "utc").map(iso)).toEqual(["2026-11-15T00:00:00.000Z", "2026-12-01T00:00:00.000Z"]);
  });

  it("searches 9 years after each time, and gives none for a day that never comes", () => {
    expect(nextTimes(parseCron("0 0 29 2 *"), utc("2026-01-01T00:00:00Z"), 3, "utc").map(iso)).toEqual([
      "2028-02-29T00:00:00.000Z",
      "2032-02-29T00:00:00.000Z",
      "2036-02-29T00:00:00.000Z",
    ]);
    expect(nextTimes(parseCron("0 0 31 2 *"), utc("2026-01-01T00:00:00Z"), 3, "utc")).toEqual([]);
  });
});

describe("local time", () => {
  it("matches the fields of the local time of the host", () => {
    const time = nextTime(parseCron("30 9 * * *"), utc("2026-01-15T00:00:00Z"), "local")!;
    const date = new Date(time);
    expect([date.getHours(), date.getMinutes()]).toEqual([9, 30]);
  });

  it("formats a time with the offset of the host, and the text parses to the same time", () => {
    const time = utc("2026-10-16T12:34:56Z");
    expect(formatTime(time, "utc")).toBe("2026-10-16T12:34:56Z");
    const local = formatTime(time, "local");
    expect(local).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(Z|[+-]\d\d:\d\d)$/);
    expect(Date.parse(local)).toBe(time);
  });

  it("is the time zone of the process, which hostTimeZone gives", () => {
    const zone = hostTimeZone();
    const time = utc("2026-01-15T08:00:00Z");
    expect(formatTime(time, "local")).toBe(formatTime(time, zone));
    expect(nextTime(parseCron("30 2 * * *"), time, "local")).toBe(nextTime(parseCron("30 2 * * *"), time, zone));
    expect(zoneFor("local", "Asia/Kolkata")).toBe("Asia/Kolkata");
    expect(zoneFor("local", undefined)).toBe("local");
    expect(zoneFor("utc", "Asia/Kolkata")).toBe("utc");
  });
});

/** The next times of an expression in a zone, as ISO texts with the offset of the zone. */
const inZone = (cron: string, after: string, count: number, zone: string): string[] => nextTimes(parseCron(cron), utc(after), count, zone).map((time) => formatTime(time, zone));

describe("IANA time zones", () => {
  it("checks a name with Intl, and gives the case of Intl", () => {
    expect(checkTimeZone("utc")).toBe("utc");
    expect(checkTimeZone("local")).toBe("local");
    expect(checkTimeZone("Europe/Berlin")).toBe("Europe/Berlin");
    expect(checkTimeZone("europe/BERLIN")).toBe("Europe/Berlin");
    expect(checkTimeZone("Australia/Adelaide")).toBe("Australia/Adelaide");
    expect(checkTimeZone("Etc/GMT+5")).toBe("Etc/GMT+5");
    // Intl can give another name of the same zone (Asia/Calcutta): the given name stays
    expect(checkTimeZone("Asia/Kolkata")).toBe("Asia/Kolkata");
  });

  it.each(["Mars/Olympus", "Europe/Atlantis", "+05:30", "-08:00", "", "Europe/Berlin\n", "../etc/passwd", "a".repeat(101)])("refuses the unknown zone %j", (name) => {
    let error: unknown;
    try {
      checkTimeZone(name);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ScheduleError);
    expect(error).toMatchObject({ code: "BAD_TIME_ZONE" });
  });

  it("refuses an unknown zone in nextTime and formatTime", () => {
    expect(() => nextTime(parseCron("* * * * *"), 0, "Mars/Olympus")).toThrow(expect.objectContaining({ code: "BAD_TIME_ZONE" }));
    expect(() => formatTime(0, "Mars/Olympus")).toThrow(expect.objectContaining({ code: "BAD_TIME_ZONE" }));
  });

  it("matches the wall time of a zone with a half-hour offset and no daylight saving time", () => {
    expect(inZone("0 9 * * *", "2026-01-01T00:00:00Z", 2, "Asia/Kolkata")).toEqual(["2026-01-01T09:00:00+05:30", "2026-01-02T09:00:00+05:30"]);
    expect(iso(nextTime(parseCron("0 9 * * *"), utc("2026-01-01T00:00:00Z"), "Asia/Kolkata"))).toBe("2026-01-01T03:30:00.000Z");
    expect(inZone("0 0 1 1 *", "2026-06-01T00:00:00Z", 1, "Etc/GMT+5")).toEqual(["2027-01-01T00:00:00-05:00"]);
  });

  it("formats an offset of 0 as Z, and the text parses to the same time", () => {
    expect(formatTime(utc("2026-01-15T08:00:00Z"), "Europe/London")).toBe("2026-01-15T08:00:00Z");
    expect(formatTime(utc("2026-07-15T08:00:00Z"), "Europe/London")).toBe("2026-07-15T09:00:00+01:00");
    for (const zone of ["Europe/Berlin", "Australia/Adelaide", "Asia/Kolkata", "America/New_York", "Australia/Lord_Howe"]) {
      const time = utc("2026-10-04T16:45:30Z");
      expect(Date.parse(formatTime(time, zone)), zone).toBe(time);
    }
  });

  it("finds February 29 and the day that never comes in a zone", () => {
    expect(inZone("0 0 29 2 *", "2026-03-01T00:00:00Z", 1, "Europe/Berlin")).toEqual(["2028-02-29T00:00:00+01:00"]);
    expect(nextTime(parseCron("0 0 31 2 *"), utc("2026-01-01T00:00:00Z"), "Europe/Berlin")).toBeUndefined();
    expect(nextTime(parseCron("* * 31 2 *"), utc("2026-01-01T00:00:00Z"), "Europe/Berlin")).toBeUndefined();
  });
});

describe("the changes of daylight saving time, as Vixie cron (Europe/Berlin)", () => {
  // 2026-03-29: 02:00 CET becomes 03:00 CEST (01:00Z). 2026-10-25: 03:00 CEST becomes 02:00 CET (01:00Z).
  const zone = "Europe/Berlin";

  it("parses a fixed time: no * at the start of the minute and the hour fields", () => {
    expect(parseCron("30 2 * * *").fixedTime).toBe(true);
    expect(parseCron("0,30 1-3 * * *").fixedTime).toBe(true);
    expect(parseCron("@daily").fixedTime).toBe(true);
    expect(parseCron("*/15 2 * * *").fixedTime).toBe(false);
    expect(parseCron("30 * * * *").fixedTime).toBe(false);
    expect(parseCron("@hourly").fixedTime).toBe(false);
  });

  it("runs a fixed time in the hour that does not exist once, at the first minute after the change", () => {
    expect(inZone("30 2 * * *", "2026-03-28T12:00:00Z", 3, zone)).toEqual(["2026-03-29T03:00:00+02:00", "2026-03-30T02:30:00+02:00", "2026-03-31T02:30:00+02:00"]);
    expect(iso(nextTime(parseCron("30 2 * * *"), utc("2026-03-28T12:00:00Z"), zone))).toBe("2026-03-29T01:00:00.000Z");
    // Two times in the gap give one run. 03:00 itself is also a time of the expression.
    expect(inZone("0,30 2 * * *", "2026-03-28T12:00:00Z", 2, zone)).toEqual(["2026-03-29T03:00:00+02:00", "2026-03-30T02:00:00+02:00"]);
    expect(inZone("30 2,3 * * *", "2026-03-28T12:00:00Z", 3, zone)).toEqual(["2026-03-29T03:00:00+02:00", "2026-03-29T03:30:00+02:00", "2026-03-30T02:30:00+02:00"]);
    // A time after the gap is normal
    expect(inZone("0 3 * * *", "2026-03-28T12:00:00Z", 1, zone)).toEqual(["2026-03-29T03:00:00+02:00"]);
  });

  it("runs a fixed time in the hour that occurs twice once, at its first occurrence", () => {
    expect(inZone("30 2 * * *", "2026-10-24T12:00:00Z", 3, zone)).toEqual(["2026-10-25T02:30:00+02:00", "2026-10-26T02:30:00+01:00", "2026-10-27T02:30:00+01:00"]);
    // From the second occurrence of the hour: 02:30 ran already that day
    expect(inZone("30 2 * * *", "2026-10-25T01:10:00Z", 1, zone)).toEqual(["2026-10-26T02:30:00+01:00"]);
    expect(inZone("45 2 * * *", "2026-10-25T00:50:00Z", 1, zone)).toEqual(["2026-10-26T02:45:00+01:00"]);
    // From 02:50 CEST, 02:10 occurred before (02:10 CEST): the next time is 03:10 CET
    expect(inZone("10 2,3 * * *", "2026-10-25T00:50:00Z", 2, zone)).toEqual(["2026-10-25T03:10:00+01:00", "2026-10-26T02:10:00+01:00"]);
  });

  it("follows the clock with * in the minute or the hour field: no run in the gap, two runs in the hour that occurs twice", () => {
    expect(inZone("*/30 * * * *", "2026-03-29T00:10:00Z", 3, zone)).toEqual(["2026-03-29T01:30:00+01:00", "2026-03-29T03:00:00+02:00", "2026-03-29T03:30:00+02:00"]);
    expect(inZone("30 * * * *", "2026-03-29T00:10:00Z", 2, zone)).toEqual(["2026-03-29T01:30:00+01:00", "2026-03-29T03:30:00+02:00"]);
    expect(inZone("*/30 * * * *", "2026-10-24T23:10:00Z", 6, zone)).toEqual([
      "2026-10-25T01:30:00+02:00",
      "2026-10-25T02:00:00+02:00",
      "2026-10-25T02:30:00+02:00",
      "2026-10-25T02:00:00+01:00",
      "2026-10-25T02:30:00+01:00",
      "2026-10-25T03:00:00+01:00",
    ]);
    // From the end of the first occurrence: the second occurrence comes next
    expect(inZone("*/30 * * * *", "2026-10-25T00:50:00Z", 2, zone)).toEqual(["2026-10-25T02:00:00+01:00", "2026-10-25T02:30:00+01:00"]);
    // A field with * in the hour that occurs twice: */10 2 runs 12 times that day, and none on the day of the gap
    expect(nextTimes(parseCron("*/10 2 * * *"), utc("2026-10-24T12:00:00Z"), 13, zone).filter((time) => formatTime(time, zone).startsWith("2026-10-25"))).toHaveLength(12);
    expect(inZone("*/10 2 * * *", "2026-03-28T12:00:00Z", 1, zone)).toEqual(["2026-03-30T02:00:00+02:00"]);
  });

  it("gives each 15 minutes of real time across the two changes for */15", () => {
    for (const after of ["2026-03-28T22:00:00Z", "2026-10-24T22:00:00Z"]) {
      const times = nextTimes(parseCron("*/15 * * * *"), utc(after), 40, zone);
      for (let index = 1; index < times.length; index++) expect(times[index]! - times[index - 1]!).toBe(15 * 60_000);
    }
  });

  it("runs a fixed time on each day of a year once, and the times stay in order", () => {
    const times = nextTimes(parseCron("30 2 * * *"), utc("2025-12-31T12:00:00Z"), 365, zone);
    const days = times.map((time) => formatTime(time, zone).slice(0, 10));
    expect(new Set(days).size).toBe(365);
    expect(days[0]).toBe("2026-01-01");
    expect(days[364]).toBe("2026-12-31");
    for (let index = 1; index < times.length; index++) expect(times[index]!).toBeGreaterThan(times[index - 1]!);
  });
});

describe("the changes of daylight saving time in a zone with a half-hour offset (Australia/Adelaide)", () => {
  // 2026-04-05: 03:00 ACDT (+10:30) becomes 02:00 ACST (+09:30) at 16:30Z on 04-04.
  // 2026-10-04: 02:00 ACST becomes 03:00 ACDT at 16:30Z on 10-03.
  const zone = "Australia/Adelaide";

  it("runs a fixed time in the hour that does not exist once, at the first minute after the change", () => {
    expect(inZone("30 2 * * *", "2026-10-03T00:00:00Z", 2, zone)).toEqual(["2026-10-04T03:00:00+10:30", "2026-10-05T02:30:00+10:30"]);
    expect(iso(nextTime(parseCron("30 2 * * *"), utc("2026-10-03T00:00:00Z"), zone))).toBe("2026-10-03T16:30:00.000Z");
    expect(inZone("0,15,45 2 * * *", "2026-10-03T00:00:00Z", 2, zone)).toEqual(["2026-10-04T03:00:00+10:30", "2026-10-05T02:00:00+10:30"]);
  });

  it("runs a fixed time in the hour that occurs twice once, at its first occurrence", () => {
    expect(inZone("30 2 * * *", "2026-04-04T00:00:00Z", 2, zone)).toEqual(["2026-04-05T02:30:00+10:30", "2026-04-06T02:30:00+09:30"]);
    expect(iso(nextTime(parseCron("30 2 * * *"), utc("2026-04-04T00:00:00Z"), zone))).toBe("2026-04-04T16:00:00.000Z");
    expect(inZone("30 2 * * *", "2026-04-04T16:40:00Z", 1, zone)).toEqual(["2026-04-06T02:30:00+09:30"]);
  });

  it("follows the clock with * in the hour field", () => {
    expect(inZone("0 * * * *", "2026-04-04T14:00:00Z", 4, zone)).toEqual([
      "2026-04-05T01:00:00+10:30",
      "2026-04-05T02:00:00+10:30",
      "2026-04-05T02:00:00+09:30",
      "2026-04-05T03:00:00+09:30",
    ]);
    expect(inZone("30 * * * *", "2026-10-03T15:00:00Z", 2, zone)).toEqual(["2026-10-04T01:30:00+09:30", "2026-10-04T03:30:00+10:30"]);
  });

  it("gives the same rules for a change of 30 minutes (Australia/Lord_Howe)", () => {
    // 2026-10-04: 02:00 becomes 02:30 (+11:00). 2026-04-05: 02:00 becomes 01:30 (+10:30).
    expect(inZone("15 2 * * *", "2026-10-03T00:00:00Z", 2, "Australia/Lord_Howe")).toEqual(["2026-10-04T02:30:00+11:00", "2026-10-05T02:15:00+11:00"]);
    expect(inZone("45 1 * * *", "2026-04-04T00:00:00Z", 2, "Australia/Lord_Howe")).toEqual(["2026-04-05T01:45:00+11:00", "2026-04-06T01:45:00+10:30"]);
    const times = nextTimes(parseCron("*/15 * * * *"), utc("2026-04-04T14:00:00Z"), 12, "Australia/Lord_Howe");
    for (let index = 1; index < times.length; index++) expect(times[index]! - times[index - 1]!).toBe(15 * 60_000);
  });
});
