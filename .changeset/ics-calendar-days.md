---
"@procedures/ics": minor
---

New functions for calendar days. They use `Intl` only, as `@procedures/schedule` does.

- `localDate(instant, timeZone)` gives the date (`YYYY-MM-DD`) of an instant in an IANA time zone.
- `zonedOffset(date, time, timeZone)` gives the UTC offset (`+HH:MM` or `-HH:MM`) of a local time, with the rules of RFC 5545.
- `shiftDay(date, days)` gives the date some days after a date, with the arithmetic of UTC.
- `daysBetween(from, to)` gives the number of whole days from one date to another.
- A date, a time, an instant or a time zone that is not correct throws a `RangeError`.

A correction of the reader: `zonedToUtc` and the `TZID` times of `parseIcs` follow RFC 5545 (3.3.5).

- A local time in the gap of the change to daylight time uses the offset before the gap. 02:30 on 2026-03-08 in `America/New_York` becomes 07:30 UTC (03:30 daylight time). Before, it became 06:30 UTC (01:30 standard time).
- A local time that occurs two times gives its first occurrence. 02:30 on 2026-10-25 in `Europe/Berlin` becomes 00:30 UTC. Before, a zone east of UTC gave the second occurrence (01:30 UTC).
- The other local times do not change.
