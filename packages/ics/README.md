# @procedures/ics

[![npm](https://img.shields.io/npm/v/@procedures/ics?color=2346c4&label=npm)](https://www.npmjs.com/package/@procedures/ics)

An iCalendar (RFC 5545) reader without dependencies. It gives the events of a calendar and the occurrences of each event in a time window, with the recurrence rules.

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
| `ics.fetch` | reads `network` | Gets a calendar feed and reads its events. No error repeats the feed address. |

## Example

```ts
const { occurrences } = await client.exec(["ics", "occurrences"], {
  text,
  from: "2026-10-01T00:00:00Z",
  to: "2026-10-31T23:59:59Z",
});
```

## Recurrences

`ics.occurrences` knows `FREQ` `DAILY`, `WEEKLY` (with `BYDAY`), `MONTHLY` and `YEARLY`, with `INTERVAL`, `COUNT`, `UNTIL` and `EXDATE`. An event with a `TZID` keeps its local time across a change of daylight saving time. A month without the day of a monthly event (a 31st in April) has no occurrence. An all-day event starts at noon UTC of its date, so each time zone reads the same date.

## Private feeds

The address of a private calendar feed is a secret. `ics.fetch` does not put the address in an error message.
