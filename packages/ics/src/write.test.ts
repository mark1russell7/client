import { describe, expect, it } from "vitest";
import { ProcedureRegistry, invokePath, outputValue } from "@procedures/client";
import { parseIcs, unescapeText, type IcsEvent } from "./ics.js";
import { escapeText, foldLine, formatDate, formatUtc, writeIcs, type IcsWriteEvent } from "./write.js";
import { icsProcedures } from "./procedures.js";

const STAMP = "2026-10-16T08:30:00Z";
const octets = (line: string): number => Buffer.byteLength(line, "utf8");
const physicalLines = (text: string): string[] => text.split("\r\n").slice(0, -1);

/** Made-up events with each kind of value that the writer must keep. */
const events: IcsWriteEvent[] = [
  {
    uid: "standup,1;a@example.org",
    summary: "Standup, daily; team \\ ops\nRoom 4 (C:\\new)",
    start: "2026-10-05T09:00:00Z",
    end: "2026-10-05T09:15:00Z",
    rrule: "FREQ=WEEKLY;BYDAY=MO,WE;COUNT=6",
    exdates: ["2026-10-07"],
    location: `Salle des fêtes — 東京タワー 🎉 ${"Långgatan ".repeat(8)}`,
    description: "Notes\r\nline 2",
    url: "https://example.org/events/standup?a=1&b=2",
    status: "CONFIRMED",
    sequence: 3,
  },
  { uid: "holiday@example.org", summary: "Holiday", start: "2026-12-25", end: "2026-12-26", allDay: true },
  { uid: "call@example.org", summary: "Call", start: "2026-10-20T15:30:00.250+02:00" },
];

describe("writeIcs", () => {
  const text = writeIcs(events, { stamp: STAMP });

  it("writes a text that parseIcs reads back to the same events", () => {
    expect(parseIcs(text)).toEqual<IcsEvent[]>([
      {
        uid: "standup,1;a@example.org",
        summary: "Standup, daily; team \\ ops\nRoom 4 (C:\\new)",
        start: "2026-10-05T09:00:00Z",
        end: "2026-10-05T09:15:00Z",
        allDay: false,
        rrule: "FREQ=WEEKLY;BYDAY=MO,WE;COUNT=6",
        exdates: ["2026-10-07"],
        location: `Salle des fêtes — 東京タワー 🎉 ${"Långgatan ".repeat(8)}`,
        sequence: 3,
      },
      { uid: "holiday@example.org", summary: "Holiday", start: "2026-12-25T12:00:00Z", end: "2026-12-26T12:00:00Z", allDay: true },
      // No DTEND: the reader gives one hour. The writer drops the fraction of a second.
      { uid: "call@example.org", summary: "Call", start: "2026-10-20T13:30:00Z", end: "2026-10-20T14:30:00Z", allDay: false },
    ]);
  });

  it("writes the events of parseIcs back to the same events", () => {
    const parsed = parseIcs(text);
    expect(parseIcs(writeIcs(parsed, { stamp: STAMP }))).toEqual(parsed);
  });

  it("ends each line with CRLF and folds each line at 75 octets without dividing a character", () => {
    expect(text.endsWith("\r\n")).toBe(true);
    expect(text.replaceAll("\r\n", "")).not.toMatch(/[\r\n]/);
    const lines = physicalLines(text);
    for (const line of lines) expect(octets(line), line).toBeLessThanOrEqual(75);
    // The long LOCATION line is folded, and the continuation lines start with one space
    const start = lines.findIndex((line) => line.startsWith("LOCATION:"));
    expect(lines[start + 1]?.startsWith(" ")).toBe(true);
    expect(text).not.toContain("\uFFFD");
  });

  it("escapes the TEXT values and writes the other values as they are", () => {
    const unfolded = text.replace(/\r\n /g, "");
    expect(unfolded).toContain("UID:standup\\,1\\;a@example.org\r\n");
    expect(unfolded).toContain("SUMMARY:Standup\\, daily\\; team \\\\ ops\\nRoom 4 (C:\\\\new)\r\n");
    expect(unfolded).toContain("DESCRIPTION:Notes\\nline 2\r\n");
    expect(unfolded).toContain("URL:https://example.org/events/standup?a=1&b=2\r\n");
    expect(unfolded).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=6\r\n");
    expect(unfolded).toContain("EXDATE:20261007T090000Z\r\n");
    expect(unfolded).toContain("DTSTART;VALUE=DATE:20261225\r\nDTEND;VALUE=DATE:20261226\r\n");
    expect(unfolded).toContain("DTSTART:20261020T133000Z\r\nSUMMARY:Call\r\n");
  });

  it("writes the calendar properties and the exact lines of a small calendar", () => {
    const small = writeIcs(
      [
        { uid: "a@example.org", summary: "Dinner", start: "2026-11-01T23:00:00Z", end: "2026-11-02T01:00:00Z", status: "TENTATIVE", sequence: 0 },
        // A tombstone: a calendar removes this UID at the next import
        { uid: "b@example.org", start: "2026-11-01T23:00:00Z", status: "CANCELLED", sequence: 12 },
      ],
      { prodId: "-//Example//Test//EN", method: "publish", calscale: "GREGORIAN", calendarName: "Family, home", stamp: STAMP }
    );
    expect(small).toBe(
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Example//Test//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:Family\\, home",
        "BEGIN:VEVENT",
        "UID:a@example.org",
        "DTSTAMP:20261016T083000Z",
        "DTSTART:20261101T230000Z",
        "DTEND:20261102T010000Z",
        "SUMMARY:Dinner",
        "STATUS:TENTATIVE",
        "SEQUENCE:0",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:b@example.org",
        "DTSTAMP:20261016T083000Z",
        "DTSTART:20261101T230000Z",
        "STATUS:CANCELLED",
        "SEQUENCE:12",
        "END:VEVENT",
        "END:VCALENDAR",
        "",
      ].join("\r\n")
    );
    // The reader skips a cancelled event
    expect(parseIcs(small).map((event) => event.uid)).toEqual(["a@example.org"]);
  });

  it("uses the default PRODID and the current time as DTSTAMP", () => {
    const before = formatUtc(new Date(Date.now() - 1000).toISOString());
    const out = writeIcs([{ uid: "x", start: "2026-10-16T10:00:00Z" }]);
    expect(out).toContain("PRODID:-//procedures//ics//EN\r\n");
    expect(out).not.toContain("METHOD:");
    const stamp = /DTSTAMP:(\d{8}T\d{6}Z)/.exec(out)?.[1] ?? "";
    expect(stamp >= before).toBe(true);
  });

  it("refuses a value that the format cannot hold", () => {
    expect(() => writeIcs([{ uid: "x", start: "soon" }])).toThrow(RangeError);
    expect(() => writeIcs([{ uid: "", start: STAMP }])).toThrow(/no UID/);
    expect(() => writeIcs([{ uid: "x", start: STAMP, rrule: "FREQ=DAILY\r\nATTENDEE:mailto:a@example.org" }])).toThrow(/RRULE/);
    expect(() => writeIcs([{ uid: "x", start: STAMP, url: "https://example.org/a b" }])).toThrow(/URL/);
    expect(() => writeIcs([{ uid: "x", start: STAMP, sequence: -1 }])).toThrow(/SEQUENCE/);
    expect(() => writeIcs([{ uid: "x", start: "2026-02-30", allDay: true }])).toThrow(/date/);
    expect(() => writeIcs([], { method: "PUBLISH\r\nX-EVIL:1" })).toThrow(/METHOD/);
  });
});

describe("the parts of the writer", () => {
  it("escapeText escapes \\ ; , and each line break, and removes the other control characters", () => {
    expect(escapeText("a\\b;c,d\ne\r\nf\rg\u0007h\ti")).toBe("a\\\\b\\;c\\,d\\ne\\nf\\ngh\ti");
    for (const value of ["a\\nb", "C:\\new", "x;y,z\\", "line\nbreak"]) expect(unescapeText(escapeText(value))).toBe(value);
  });

  it("foldLine keeps 75 octets on the first line and 74 after the space of each next line", () => {
    expect(foldLine("X".repeat(75))).toBe("X".repeat(75));
    expect(foldLine("X".repeat(150))).toBe(`${"X".repeat(75)}\r\n ${"X".repeat(74)}\r\n X`);
  });

  it("foldLine does not divide a character of two, three or four octets", () => {
    expect(foldLine(`${"X".repeat(74)}é`)).toBe(`${"X".repeat(74)}\r\n é`);
    expect(foldLine(`${"X".repeat(73)}東`)).toBe(`${"X".repeat(73)}\r\n 東`);
    expect(foldLine(`${"X".repeat(72)}🎉`)).toBe(`${"X".repeat(72)}\r\n 🎉`);
    expect(foldLine(`${"X".repeat(71)}🎉`)).toBe(`${"X".repeat(71)}🎉`);
    const folded = foldLine("東".repeat(60));
    for (const line of folded.split("\r\n")) expect(octets(line)).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe("東".repeat(60));
  });

  it("formatUtc and formatDate give the forms of RFC 5545", () => {
    expect(formatUtc("2026-10-16T10:15:30.999-04:00")).toBe("20261016T141530Z");
    expect(formatDate("2026-10-16T23:00:00-05:00")).toBe("20261016");
    expect(() => formatDate("16/10/2026")).toThrow(RangeError);
  });
});

describe("ics.write", () => {
  const registry = new ProcedureRegistry();
  for (const procedure of icsProcedures) registry.register(procedure);
  const call = async <T>(path: string[], input: unknown): Promise<T> =>
    (await outputValue(await invokePath(path, input, { registry }), path)) as T;

  it("gives the text that ics.parse reads", async () => {
    const { text } = await call<{ text: string }>(["ics", "write"], {
      events: [{ uid: "a@example.org", summary: "Review", start: "2026-10-05T09:00:00Z", rrule: "FREQ=WEEKLY;COUNT=2" }],
      method: "PUBLISH",
      stamp: STAMP,
    });
    expect(text).toContain("METHOD:PUBLISH\r\n");
    const { events: parsed } = await call<{ events: IcsEvent[] }>(["ics", "parse"], { text });
    expect(parsed).toEqual([
      { uid: "a@example.org", summary: "Review", start: "2026-10-05T09:00:00Z", end: "2026-10-05T10:00:00Z", allDay: false, rrule: "FREQ=WEEKLY;COUNT=2" },
    ]);
  });

  it("refuses an unknown STATUS and a time that is not ISO 8601", async () => {
    await expect(call(["ics", "write"], { events: [{ uid: "a", start: STAMP, status: "DONE" }] })).rejects.toThrow();
    await expect(call(["ics", "write"], { events: [{ uid: "a", start: "tomorrow" }] })).rejects.toThrow(/ISO 8601/);
  });
});
