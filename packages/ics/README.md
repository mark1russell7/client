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

## Local times

The reader changes a `TZID` time to UTC as RFC 5545 (3.3.5) tells. The function `zonedToUtc` does the same:

- A local time that occurs two times, after the change back to standard time, gives its first occurrence. In `America/New_York`, 01:30 on 2026-11-01 is 05:30 UTC.
- A local time in the gap of the change to daylight time uses the offset before the gap. In `America/New_York`, 02:30 on 2026-03-08 is 07:30 UTC (03:30 daylight time).

## Calendar days

The package also exports these functions for calendar days. They use `Intl` only, without a time zone database, as `@procedures/schedule` does.

| Function | What it gives |
| --- | --- |
| `localDate(instant, timeZone)` | The date (`YYYY-MM-DD`) that a clock in the zone shows at the instant. The instant is a `Date`, the milliseconds since 1970 or a text. |
| `zonedOffset(date, time, timeZone)` | The UTC offset (`+HH:MM` or `-HH:MM`) of a local time (`HH:MM` or `HH:MM:SS`) on a date, with the rules of RFC 5545. |
| `localTime(instant, timeZone)` | The time (`HH:MM`, from 00:00 to 23:59) that a clock in the zone shows at the instant. |
| `shiftDay(date, days)` | The date `days` days after a date. A negative number gives an earlier date. |
| `shiftMonth(date, months)` | The date `months` months after a date. When the month does not have the day, the result is its last day. |
| `daysBetween(from, to)` | The number of whole days from one date to another. It is negative when `to` is before `from`. |
| `weekdayOf(date)` | The day of the week of a date: 0 for Sunday to 6 for Saturday. |
| `weekdayName(date, options)` | The name of the day of the week of a date. The default is the long English name. |

```ts
import { daysBetween, localDate, shiftDay, shiftMonth, weekdayName, zonedOffset } from "@procedures/ics";

localDate("2026-10-17T03:00:00Z", "America/New_York"); // "2026-10-16"
zonedOffset("2026-03-08", "02:30", "America/New_York"); // "-05:00": 02:30-05:00 is 03:30 daylight time
shiftDay("2026-03-07", 2); // "2026-03-09"
shiftMonth("2026-01-31", 1); // "2026-02-28"
shiftDay(shiftMonth("2026-01-01", 1), 30); // "2026-03-03": the arithmetic of Date.UTC
weekdayName("2026-10-17"); // "Saturday"
daysBetween("2026-10-31", "2026-11-02"); // 2
```

- A date is a text `YYYY-MM-DD` of the years 0000 to 9999. `2026-02-30` is not a date.
- `shiftDay` and `daysBetween` use the arithmetic of UTC. A change of daylight saving time does not move a date.
- The number of days of `shiftDay` and the number of months of `shiftMonth` must be integers.
- `localDate` gives the result of the `en-CA` format of `Intl`, with the year in four digits.
- The time zone is an IANA name that `Intl` knows, for example `Europe/Berlin` or `UTC`.
- A value that is not correct throws a `RangeError`: a date, a time, an instant or a time zone.

## Private feeds

The address of a private calendar feed is a secret. `ics.fetch` does not put the address in an error message.

The function `fetchCalendar(url, timeoutMs, signal, { fetch })` gets the text of a feed. It refuses an HTTP error and a page that is not a calendar. The option `fetch` replaces the global `fetch`, for a test or a host with its own client.

## The host policy

`ics.fetch` sends its request with the `fetch` of the module. The default is the global `fetch`, so the root stays safe for a browser.

A Node host that serves other callers gives `createHostFetch()` of `@procedures/http` to `createIcsModule()`. Then the host policy examines the feed address and each redirect. It refuses a loopback, private or link-local address, unless the `allow` list of the host has it:

```ts
import { createHostFetch } from "@procedures/http";
import { createIcsModule } from "@procedures/ics/module";

const registry = createRegistry(createIcsModule({ fetch: createHostFetch() }));
```

A refusal is `FORBIDDEN` with the reason `host-not-allowed`. Its message does not contain the address of the feed. `mcpHostModules` of `@procedures/bundle-assistant` has a module of `ics` with this policy. The dev-tools server uses it. In 0.28, that module still sends a refused request, with a `DeprecationWarning`. Version 0.29.0 refuses it.
