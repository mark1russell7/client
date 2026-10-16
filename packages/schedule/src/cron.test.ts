/**
 * The cron expressions (roadmap R46): the parse, the errors, the next times in UTC and in local
 * time, the two day fields, and the changes of summer time.
 */

import { afterEach, describe, expect, it } from "vitest";
import { CRON_NAMES, formatTime, nextTime, nextTimes, parseCron } from "./cron.js";
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
  const original = process.env["TZ"];
  afterEach(() => {
    if (original === undefined) delete process.env["TZ"];
    else process.env["TZ"] = original;
  });

  it("matches the fields of the local time of the host", () => {
    const time = nextTime(parseCron("30 9 * * *"), Date.now(), "local")!;
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

  it("skips a time that the change to summer time skips, and goes on after the change back", () => {
    process.env["TZ"] = "America/New_York";
    // Node reads TZ again after a change. Without the time zone data, the test has no subject.
    if (new Date(2026, 6, 1).getTimezoneOffset() !== 240) return;
    // 2026-03-08: 02:00 becomes 03:00, so 02:30 does not exist that day
    const spring = nextTimes(parseCron("30 2 * * *"), new Date(2026, 2, 7, 12, 0).getTime(), 2, "local").map((time) => formatTime(time, "local"));
    expect(spring).toEqual(["2026-03-09T02:30:00-04:00", "2026-03-10T02:30:00-04:00"]);
    expect(formatTime(new Date(2026, 0, 15, 8, 0).getTime(), "local")).toBe("2026-01-15T08:00:00-05:00");
    // 2026-11-01: 02:00 becomes 01:00. The times stay in order, and the next day comes.
    const autumn = nextTimes(parseCron("0 * * * *"), new Date(2026, 9, 31, 23, 30).getTime(), 5, "local");
    for (let index = 1; index < autumn.length; index++) expect(autumn[index]!).toBeGreaterThan(autumn[index - 1]!);
    expect(formatTime(autumn[4]!, "local")).toMatch(/^2026-11-01T0[23]:00:00-05:00$/);
  });
});
