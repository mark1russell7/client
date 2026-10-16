# @procedures/ics

[![npm](https://img.shields.io/npm/v/@procedures/ics?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/ics)

An iCalendar (RFC 5545) reader and writer without dependencies. The reader gives the events of a calendar and the occurrences of each event in a time window, with the recurrence rules. The writer makes a calendar from events.

## Install

```bash
pnpm add @procedures/ics @procedures/client
```

A host registers the procedures with `createRegistry(icsModule)`, or with `import "@procedures/ics/register"` for the global registry. The package root and `./module` register nothing.

## Procedures

| Procedure | Effects | What it does |
| --- | --- | --- |
| `ics.parse` | none | Reads the events of an iCalendar text. |
| `ics.occurrences` | none | Gives the occurrences of the events in a time window. An edited instance replaces its occurrence. |
| `ics.write` | none | Writes an iCalendar text from events. `ics.parse` reads the text back to the same events. |
| `ics.fetch` | reads `network` | Gets a calendar feed and reads its events. No error repeats the feed address. |

## Example

```ts
const { occurrences } = await client.exec(["ics", "occurrences"], {
  text,
  from: "2026-10-01T00:00:00Z",
  to: "2026-10-31T23:59:59Z",
});
```

## Write a calendar

The function `writeIcs(events, options)` and the procedure `ics.write` make the same text:

```ts
import { writeIcs } from "@procedures/ics";

const text = writeIcs(
  [
    { uid: "dinner-1@example.org", summary: "Dinner", start: "2026-11-01T23:00:00Z", end: "2026-11-02T01:00:00Z", sequence: 4 },
    { uid: "trip@example.org", summary: "Trip", start: "2026-12-24", end: "2026-12-27", allDay: true },
    { uid: "old-time@example.org", start: "2026-11-01T22:00:00Z", status: "CANCELLED", sequence: 4 },
  ],
  { prodId: "-//Example//Plans//EN", method: "PUBLISH", calendarName: "Plans" }
);
```

- An event has `uid` and `start`. The other fields are optional: `end`, `allDay`, `summary`, `location`, `description`, `url`, `sequence`, `status`, `rrule` and `exdates`.
- The writer writes each time in UTC (`20261101T230000Z`). An all-day event gets `VALUE=DATE`, and its end date is exclusive.
- The writer escapes `\`, `;`, `,` and each line break in a text value. It removes the other control characters.
- The writer folds each line at 75 octets of UTF-8. A fold does not divide a character. Each line ends with CRLF.
- The options set the calendar properties: `prodId`, `method`, `calscale` and `calendarName` (`X-WR-CALNAME`). `VERSION` is always `2.0`.
- `stamp` sets the `DTSTAMP` of each event. The default is the current time.
- The writer throws a `RangeError` for a value that the format cannot hold. Examples are a time that is not ISO 8601 and a line break in `rrule`.
- The caller keeps `sequence` and `status`. To remove an event from a calendar, write its `uid` with `status: "CANCELLED"` and a higher `sequence`.
- The reader skips an event with `STATUS:CANCELLED`, and it does not read `DESCRIPTION`, `URL` or `STATUS`. The writer writes no `TZID` and no `RECURRENCE-ID`.

## Recurrences

`ics.occurrences` knows `FREQ` `DAILY`, `WEEKLY` (with `BYDAY`), `MONTHLY` and `YEARLY`, with `INTERVAL`, `COUNT`, `UNTIL` and `EXDATE`. An event with a `TZID` keeps its local time across a change of daylight saving time. A month without the day of a monthly event (a 31st in April) has no occurrence. An all-day event starts at noon UTC of its date, so each time zone reads the same date.

## Private feeds

The address of a private calendar feed is a secret. `ics.fetch` does not put the address in an error message.
