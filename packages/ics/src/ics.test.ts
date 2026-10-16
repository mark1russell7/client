import { afterEach, describe, expect, it, vi } from "vitest";
import { ProcedureRegistry, invokePath, outputValue } from "@procedures/client";
import { calendarOccurrences, expandOccurrences, isCalendar, parseIcs, unescapeText, zonedToUtc, type IcsEvent } from "./ics.js";
import { icsProcedures } from "./procedures.js";

/** A calendar of made-up events. */
const calendar = (...events: string[][]): string =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", ...events.flatMap((lines) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"]), "END:VCALENDAR"].join("\r\n");

const starts = (occurrences: Array<{ start: string }>): string[] => occurrences.map((o) => o.start);

describe("parseIcs", () => {
  it("reads a UTC event, joins folded lines and gives an end of one hour when DTEND is missing", () => {
    const [event] = parseIcs(calendar(["UID:a", "SUMMARY:Team sy", " nc", "DTSTART:20261020T150000Z"]));
    expect(event).toEqual({ uid: "a", summary: "Team sync", start: "2026-10-20T15:00:00Z", end: "2026-10-20T16:00:00Z", allDay: false });
  });

  it("changes a TZID time to UTC on both sides of a DST change", () => {
    const events = parseIcs(
      calendar(
        ["UID:summer", "DTSTART;TZID=America/New_York:20260710T090000"],
        ["UID:winter", "DTSTART;TZID=America/New_York:20261210T090000"]
      )
    );
    expect(events.map((e) => e.start)).toEqual(["2026-07-10T13:00:00Z", "2026-12-10T14:00:00Z"]);
    expect(events[0]?.tzid).toBe("America/New_York");
  });

  it("decodes TEXT values, also \\N", () => {
    const [event] = parseIcs(calendar(["UID:t", "DTSTART:20261020T150000Z", "SUMMARY:A\\, B\\; C", "LOCATION:1 Main St\\NRoom 2"]));
    expect(event?.summary).toBe("A, B; C");
    expect(event?.location).toBe("1 Main St\nRoom 2");
    expect(unescapeText("a\\\\b")).toBe("a\\b");
    // An escaped backslash before an "n" is not a line break
    expect(unescapeText("C:\\\\new")).toBe("C:\\new");
  });

  it("decodes the escapes of a UID", () => {
    const [event] = parseIcs(calendar(["UID:a\\,b\\;c", "DTSTART:20261020T150000Z"]));
    expect(event?.uid).toBe("a,b;c");
  });

  it("puts an all-day event at noon UTC of its date, so each zone reads the same date", () => {
    const [event] = parseIcs(calendar(["UID:d", "DTSTART;VALUE=DATE:20261031"]));
    expect(event).toMatchObject({ start: "2026-10-31T12:00:00Z", end: "2026-11-01T12:00:00Z", allDay: true });
  });

  it("skips a cancelled event and an event without a UID or a start", () => {
    const events = parseIcs(
      calendar(["UID:x", "DTSTART:20261020T150000Z", "STATUS:CANCELLED"], ["DTSTART:20261020T150000Z"], ["UID:y"], ["UID:z", "DTSTART:20261020T150000Z"])
    );
    expect(events.map((e) => e.uid)).toEqual(["z"]);
  });

  it("keeps EXDATE lists, RECURRENCE-ID, SEQUENCE and LAST-MODIFIED", () => {
    const [event] = parseIcs(
      calendar([
        "UID:s",
        "DTSTART:20261001T150000Z",
        "RRULE:FREQ=DAILY",
        "EXDATE:20261003T150000Z,20261004T150000Z",
        "EXDATE:20261006T150000Z",
        "RECURRENCE-ID:20261002T150000Z",
        "SEQUENCE:3",
        "LAST-MODIFIED:20260930T120000Z",
      ])
    );
    expect(event).toMatchObject({
      exdates: ["2026-10-03", "2026-10-04", "2026-10-06"],
      recurrenceId: "2026-10-02",
      sequence: 3,
      lastModified: "20260930T120000Z",
    });
  });

  it("knows a calendar from another text", () => {
    expect(isCalendar(calendar())).toBe(true);
    expect(isCalendar("<html>Sign in</html>")).toBe(false);
  });
});

describe("zonedToUtc", () => {
  it("knows the offset on both sides of a DST change", () => {
    expect(zonedToUtc(2026, 3, 7, 12, 0, 0, "America/New_York")).toBe("2026-03-07T17:00:00Z");
    expect(zonedToUtc(2026, 3, 9, 12, 0, 0, "America/New_York")).toBe("2026-03-09T16:00:00Z");
  });
});

const event = (lines: string[]): IcsEvent => {
  const [parsed] = parseIcs(calendar(lines));
  if (!parsed) throw new Error("no event");
  return parsed;
};

describe("expandOccurrences", () => {
  const october = { from: "2026-10-01T00:00:00Z", to: "2026-10-31T23:59:59Z" };

  it("gives a single event only when it touches the window", () => {
    expect(expandOccurrences(event(["UID:a", "DTSTART:20261020T150000Z"]), october)).toHaveLength(1);
    expect(expandOccurrences(event(["UID:a", "DTSTART:20261120T150000Z"]), october)).toHaveLength(0);
  });

  it("expands DAILY with COUNT", () => {
    const occurrences = expandOccurrences(event(["UID:a", "DTSTART:20261005T090000Z", "RRULE:FREQ=DAILY;COUNT=3"]), october);
    expect(starts(occurrences)).toEqual(["2026-10-05T09:00:00Z", "2026-10-06T09:00:00Z", "2026-10-07T09:00:00Z"]);
  });

  it("expands WEEKLY with BYDAY in the window", () => {
    const week = { from: "2026-10-12T00:00:00Z", to: "2026-10-18T23:59:59Z" };
    const occurrences = expandOccurrences(event(["UID:a", "DTSTART:20261005T090000Z", "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR"]), week);
    expect(starts(occurrences)).toEqual(["2026-10-12T09:00:00Z", "2026-10-14T09:00:00Z", "2026-10-16T09:00:00Z"]);
  });

  it("reaches the window from a series that started years before", () => {
    const occurrences = expandOccurrences(event(["UID:a", "DTSTART:20190107T090000Z", "RRULE:FREQ=WEEKLY"]), october);
    expect(starts(occurrences)).toEqual([
      "2026-10-05T09:00:00Z",
      "2026-10-12T09:00:00Z",
      "2026-10-19T09:00:00Z",
      "2026-10-26T09:00:00Z",
    ]);
    const daily = expandOccurrences(event(["UID:b", "DTSTART:20200101T090000Z", "RRULE:FREQ=DAILY"]), {
      from: "2026-10-20T00:00:00Z",
      to: "2026-10-21T23:59:59Z",
    });
    expect(starts(daily)).toEqual(["2026-10-20T09:00:00Z", "2026-10-21T09:00:00Z"]);
  });

  it("keeps the local time of a TZID series across a DST change", () => {
    const occurrences = expandOccurrences(
      event(["UID:a", "DTSTART;TZID=America/New_York:20261026T180000", "RRULE:FREQ=WEEKLY"]),
      { from: "2026-10-25T00:00:00Z", to: "2026-11-03T23:59:59Z" }
    );
    // 6 PM in New York: 22:00 UTC before November 1, 23:00 UTC after
    expect(starts(occurrences)).toEqual(["2026-10-26T22:00:00Z", "2026-11-02T23:00:00Z"]);
  });

  it("removes the EXDATE dates", () => {
    const occurrences = expandOccurrences(
      event(["UID:a", "DTSTART:20261005T090000Z", "RRULE:FREQ=DAILY;COUNT=4", "EXDATE:20261006T090000Z"]),
      october
    );
    expect(starts(occurrences)).toEqual(["2026-10-05T09:00:00Z", "2026-10-07T09:00:00Z", "2026-10-08T09:00:00Z"]);
  });

  it("stops at UNTIL", () => {
    const occurrences = expandOccurrences(event(["UID:a", "DTSTART:20261005T090000Z", "RRULE:FREQ=DAILY;UNTIL=20261007"]), october);
    expect(starts(occurrences)).toHaveLength(3);
  });

  it("expands MONTHLY by calendar months and skips a month without the day", () => {
    const year = { from: "2026-01-01T00:00:00Z", to: "2026-06-30T23:59:59Z" };
    const occurrences = expandOccurrences(event(["UID:a", "DTSTART:20260131T120000Z", "RRULE:FREQ=MONTHLY"]), year);
    expect(starts(occurrences)).toEqual(["2026-01-31T12:00:00Z", "2026-03-31T12:00:00Z", "2026-05-31T12:00:00Z"]);
  });

  it("expands YEARLY, with INTERVAL and COUNT", () => {
    const decade = { from: "2020-01-01T00:00:00Z", to: "2030-12-31T23:59:59Z" };
    const occurrences = expandOccurrences(event(["UID:a", "DTSTART;VALUE=DATE:20200415", "RRULE:FREQ=YEARLY;INTERVAL=2;COUNT=3"]), decade);
    expect(starts(occurrences)).toEqual(["2020-04-15T12:00:00Z", "2022-04-15T12:00:00Z", "2024-04-15T12:00:00Z"]);
  });

  it("gives the first occurrence of a rule that it does not know", () => {
    const occurrences = expandOccurrences(event(["UID:a", "DTSTART:20261005T090000Z", "RRULE:FREQ=HOURLY"]), october);
    expect(starts(occurrences)).toEqual(["2026-10-05T09:00:00Z"]);
  });
});

describe("calendarOccurrences", () => {
  it("replaces the occurrence of a series with its edited instance, and sorts by start", () => {
    const events = parseIcs(
      calendar(
        ["UID:s", "SUMMARY:Standup", "DTSTART:20261005T090000Z", "RRULE:FREQ=DAILY;COUNT=3"],
        ["UID:s", "SUMMARY:Standup (moved)", "DTSTART:20261006T110000Z", "RECURRENCE-ID:20261006T090000Z"]
      )
    );
    const occurrences = calendarOccurrences(events, { from: "2026-10-01T00:00:00Z", to: "2026-10-31T00:00:00Z" });
    expect(occurrences.map((o) => `${o.start} ${o.summary}`)).toEqual([
      "2026-10-05T09:00:00Z Standup",
      "2026-10-06T11:00:00Z Standup (moved)",
      "2026-10-07T09:00:00Z Standup",
    ]);
  });
});

describe("the procedures", () => {
  const registry = new ProcedureRegistry();
  for (const procedure of icsProcedures) registry.register(procedure);
  const call = async <T>(path: string[], input: unknown): Promise<T> =>
    (await outputValue(await invokePath(path, input, { registry }), path)) as T;
  const text = calendar(["UID:a", "SUMMARY:Review", "DTSTART:20261005T090000Z", "RRULE:FREQ=WEEKLY;COUNT=2"]);

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ics.parse and ics.occurrences read a text", async () => {
    expect((await call<{ events: IcsEvent[] }>(["ics", "parse"], { text })).events).toHaveLength(1);
    const result = await call<{ occurrences: unknown[] }>(["ics", "occurrences"], {
      text,
      from: "2026-10-01T00:00:00Z",
      to: "2026-10-31T00:00:00Z",
    });
    expect(result.occurrences).toHaveLength(2);
  });

  it("ics.occurrences refuses a window that is not a time", async () => {
    await expect(call(["ics", "occurrences"], { text, from: "soon", to: "later" })).rejects.toThrow(/ISO 8601/);
  });

  it("ics.fetch reads a feed, refuses a page that is not a calendar and never repeats the address", async () => {
    const secret = "https://calendar.example.com/private-0123456789abcdef/basic.ics";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(text, { status: 200 })));
    expect((await call<{ events: IcsEvent[] }>(["ics", "fetch"], { url: secret })).events[0]?.uid).toBe("a");

    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Sign in</html>", { status: 200 })));
    const notCalendar = call(["ics", "fetch"], { url: secret });
    await expect(notCalendar).rejects.toThrow(/did not give an iCalendar text/);
    await expect(notCalendar).rejects.not.toThrow(/private-0123456789abcdef/);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 404 })));
    await expect(call(["ics", "fetch"], { url: secret })).rejects.toThrow(/^(?!.*private).*HTTP 404/);
  });
});
