/**
 * EXDATE and RECURRENCE-ID of an event with a TZID (audit O56 #5): they name an occurrence by
 * its date in the zone of the event, not by its date in UTC. An evening event in Los Angeles
 * starts on the next day in UTC.
 */

import { describe, expect, it } from "vitest";
import { calendarOccurrences, expandOccurrences, parseIcs } from "./ics.js";

const calendar = (...lines: string[]): string =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Google Inc//Google Calendar 70.9054//EN", ...lines, "END:VCALENDAR", ""].join("\r\n");

const starts = (occurrences: ReadonlyArray<{ start: string; summary: string }>): string[] =>
  occurrences.map((occurrence) => `${occurrence.start} ${occurrence.summary}`);

/** A weekly event at 18:00 in Los Angeles: 02:00 UTC of the next day in winter, 01:00 in summer. */
const WEEKLY = calendar(
  "BEGIN:VEVENT",
  "DTSTART;TZID=America/Los_Angeles:20260105T180000",
  "DTEND;TZID=America/Los_Angeles:20260105T190000",
  "RRULE:FREQ=WEEKLY;BYDAY=MO",
  "EXDATE;TZID=America/Los_Angeles:20260112T180000",
  "EXDATE;TZID=America/Los_Angeles:20260309T180000",
  "EXDATE:20260317T010000Z",
  "DTSTAMP:20260101T120000Z",
  "UID:choir@example.com",
  "SUMMARY:Choir practice",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;TZID=America/Los_Angeles:20260119T183000",
  "DTEND;TZID=America/Los_Angeles:20260119T193000",
  "RECURRENCE-ID;TZID=America/Los_Angeles:20260119T180000",
  "DTSTAMP:20260101T120000Z",
  "UID:choir@example.com",
  "SUMMARY:Choir practice (late start)",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;TZID=America/Los_Angeles:20260302T190000",
  "DTEND;TZID=America/Los_Angeles:20260302T200000",
  "RECURRENCE-ID:20260303T020000Z",
  "DTSTAMP:20260101T120000Z",
  "UID:choir@example.com",
  "SUMMARY:Choir practice (moved)",
  "END:VEVENT",
);

describe("EXDATE and RECURRENCE-ID in the zone of the event", () => {
  it("keeps the dates in the zone of the event, also for a value in UTC", () => {
    const [series, late, moved] = parseIcs(WEEKLY);
    expect(series?.exdates).toEqual(["2026-01-12", "2026-03-09", "2026-03-16"]);
    expect(late?.recurrenceId).toBe("2026-01-19");
    expect(moved?.recurrenceId).toBe("2026-03-02");
  });

  it("removes the occurrence that EXDATE names, and keeps the others", () => {
    const [series] = parseIcs(WEEKLY);
    const january = expandOccurrences(series!, { from: "2026-01-01T00:00:00Z", to: "2026-01-31T00:00:00Z" });
    expect(january.map((occurrence) => occurrence.start)).toEqual([
      "2026-01-06T02:00:00Z",
      "2026-01-20T02:00:00Z",
      "2026-01-27T02:00:00Z",
    ]);
  });

  it("replaces the occurrence that RECURRENCE-ID names, and does not show both", () => {
    const january = calendarOccurrences(parseIcs(WEEKLY), { from: "2026-01-01T00:00:00Z", to: "2026-01-31T00:00:00Z" });
    expect(starts(january)).toEqual([
      "2026-01-06T02:00:00Z Choir practice",
      "2026-01-20T02:30:00Z Choir practice (late start)",
      "2026-01-27T02:00:00Z Choir practice",
    ]);
  });

  it("knows the dates on both sides of the change to daylight time (8 March 2026)", () => {
    const march = calendarOccurrences(parseIcs(WEEKLY), { from: "2026-03-01T00:00:00Z", to: "2026-04-01T00:00:00Z" });
    expect(starts(march)).toEqual([
      // 2 March, standard time: the override at 19:00 replaces the occurrence at 18:00
      "2026-03-03T03:00:00Z Choir practice (moved)",
      // 9 March (EXDATE with the TZID) and 16 March (EXDATE in UTC) are removed
      "2026-03-24T01:00:00Z Choir practice",
      "2026-03-31T01:00:00Z Choir practice",
    ]);
  });

  it("uses the date in the zone also east of UTC", () => {
    // 08:00 in Tokyo is 23:00 UTC of the day before
    const [event] = parseIcs(
      calendar(
        "BEGIN:VEVENT",
        "UID:morning@example.com",
        "DTSTART;TZID=Asia/Tokyo:20260108T080000",
        "RRULE:FREQ=DAILY;COUNT=4",
        "EXDATE;TZID=Asia/Tokyo:20260110T080000",
        "END:VEVENT",
      ),
    );
    const occurrences = expandOccurrences(event!, { from: "2026-01-01T00:00:00Z", to: "2026-01-31T00:00:00Z" });
    expect(occurrences.map((occurrence) => occurrence.start)).toEqual([
      "2026-01-07T23:00:00Z",
      "2026-01-08T23:00:00Z",
      "2026-01-10T23:00:00Z",
    ]);
  });

  it("changes an EXDATE of another zone to the zone of the event", () => {
    // 02:00 of 7 January in London is 18:00 of 6 January in Los Angeles
    const [event] = parseIcs(
      calendar(
        "BEGIN:VEVENT",
        "UID:zones@example.com",
        "DTSTART;TZID=America/Los_Angeles:20260105T180000",
        "RRULE:FREQ=DAILY;COUNT=3",
        "EXDATE;TZID=Europe/London:20260107T020000",
        "END:VEVENT",
      ),
    );
    expect(event?.exdates).toEqual(["2026-01-06"]);
    const occurrences = expandOccurrences(event!, { from: "2026-01-01T00:00:00Z", to: "2026-01-31T00:00:00Z" });
    expect(occurrences.map((occurrence) => occurrence.start)).toEqual(["2026-01-06T02:00:00Z", "2026-01-08T02:00:00Z"]);
  });
});
