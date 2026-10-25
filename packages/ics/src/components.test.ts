/**
 * A component inside an event (audit O56 #3): the properties of a VALARM belong to the alarm, not
 * to its event. Apple and iCloud calendars give each alarm its own UID.
 */

import { describe, expect, it } from "vitest";
import { parseIcs } from "./ics.js";

/** An export of a calendar of macOS, with a time zone definition and two alarms in the event. */
const APPLE = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Apple Inc.//macOS 15.0//EN",
  "CALSCALE:GREGORIAN",
  "BEGIN:VTIMEZONE",
  "TZID:America/Los_Angeles",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0800",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "DTSTART:20070311T020000",
  "TZNAME:PDT",
  "TZOFFSETTO:-0700",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0700",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "DTSTART:20071104T020000",
  "TZNAME:PST",
  "TZOFFSETTO:-0800",
  "END:STANDARD",
  "END:VTIMEZONE",
  "BEGIN:VEVENT",
  "CREATED:20260101T170000Z",
  "UID:8E1A7C3B-3F0D-4C55-9E3A-2B1D0F6A9C11",
  "DTEND;TZID=America/Los_Angeles:20260105T190000",
  "SUMMARY:Choir practice",
  "DTSTART;TZID=America/Los_Angeles:20260105T180000",
  "DTSTAMP:20260101T170012Z",
  "SEQUENCE:0",
  "BEGIN:VALARM",
  "X-WR-ALARMUID:0B4E2F7D-1C9A-4E8B-A3D5-6F7E8D9C0B1A",
  "UID:0B4E2F7D-1C9A-4E8B-A3D5-6F7E8D9C0B1A",
  "TRIGGER:-PT15M",
  "ATTACH;VALUE=URI:Chord",
  "ACTION:AUDIO",
  "END:VALARM",
  "LOCATION:St. Mark's Hall",
  "BEGIN:VALARM",
  "UID:5C6D7E8F-9A0B-4C1D-8E2F-3A4B5C6D7E8F",
  "TRIGGER:-PT1H",
  "ACTION:EMAIL",
  "SUMMARY:Reminder",
  "DESCRIPTION:Choir practice starts in one hour",
  "ATTENDEE:mailto:singer@example.com",
  "END:VALARM",
  "END:VEVENT",
  "END:VCALENDAR",
  "",
].join("\r\n");

describe("parseIcs and the components inside an event", () => {
  it("keeps the UID and the SUMMARY of the event, not those of its alarms", () => {
    const events = parseIcs(APPLE);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      uid: "8E1A7C3B-3F0D-4C55-9E3A-2B1D0F6A9C11",
      summary: "Choir practice",
      start: "2026-01-06T02:00:00Z",
      end: "2026-01-06T03:00:00Z",
      tzid: "America/Los_Angeles",
      sequence: 0,
    });
  });

  it("reads the properties of the event after the end of an alarm", () => {
    expect(parseIcs(APPLE)[0]?.location).toBe("St. Mark's Hall");
  });

  it("ignores a DTSTART or an EXDATE inside an alarm", () => {
    const text = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:standup@example.com",
      "DTSTART:20261005T150000Z",
      "RRULE:FREQ=DAILY;COUNT=3",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DTSTART:20991231T000000Z",
      "EXDATE:20261006T150000Z",
      "TRIGGER;VALUE=DATE-TIME:20261005T144500Z",
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const [event] = parseIcs(text);
    expect(event?.start).toBe("2026-10-05T15:00:00Z");
    expect(event?.exdates).toBeUndefined();
  });

  it("ends an event at END:VEVENT also when an alarm has no end", () => {
    const text = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:a",
      "DTSTART:20261005T150000Z",
      "BEGIN:VALARM",
      "UID:alarm",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:b",
      "DTSTART:20261006T150000Z",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    expect(parseIcs(text).map((event) => event.uid)).toEqual(["a", "b"]);
  });
});
