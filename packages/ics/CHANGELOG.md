# @procedures/ics

## 0.6.0

### Minor Changes

- 901c238: New functions for calendar days. They use `Intl` only, as `@procedures/schedule` does.
  
  - `localDate(instant, timeZone)` gives the date (`YYYY-MM-DD`) of an instant in an IANA time zone.
  - `zonedOffset(date, time, timeZone)` gives the UTC offset (`+HH:MM` or `-HH:MM`) of a local time, with the rules of RFC 5545.
  - `shiftDay(date, days)` gives the date some days after a date, with the arithmetic of UTC.
  - `daysBetween(from, to)` gives the number of whole days from one date to another.
  - A date, a time, an instant or a time zone that is not correct throws a `RangeError`.
  
  A correction of the reader: `zonedToUtc` and the `TZID` times of `parseIcs` follow RFC 5545 (3.3.5).
  
  - A local time in the gap of the change to daylight time uses the offset before the gap. 02:30 on 2026-03-08 in `America/New_York` becomes 07:30 UTC (03:30 daylight time). Before, it became 06:30 UTC (01:30 standard time).
  - A local time that occurs two times gives its first occurrence. 02:30 on 2026-10-25 in `Europe/Berlin` becomes 00:30 UTC. Before, a zone east of UTC gave the second occurrence (01:30 UTC).
  - The other local times do not change.

### Patch Changes

- @procedures/client@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [0f75644]
- Updated dependencies [09e5566]
- Updated dependencies [ab77f75]
- Updated dependencies [a47bee6]
- Updated dependencies [bc74091]
  - @procedures/client@0.5.0

## 0.4.0

### Minor Changes

- 0f1d06e: New iCalendar writer. The function `writeIcs(events, options)` and the pure procedure `ics.write` write a calendar from events. The reader `parseIcs` reads the text back to the same events.
  
  - The writer writes `UID`, `DTSTAMP`, `DTSTART`, `DTEND`, `SUMMARY`, `LOCATION`, `DESCRIPTION`, `URL`, `RRULE`, `EXDATE`, `STATUS` and `SEQUENCE`. Each time is in UTC. An all-day event gets `VALUE=DATE`.
  - The options set `PRODID`, `METHOD`, `CALSCALE`, `X-WR-CALNAME` and the `DTSTAMP`. `VERSION` is always `2.0`.
  - The writer escapes `\`, `;`, `,` and each line break in a text value. It folds each line at 75 octets of UTF-8 and does not divide a character. Each line ends with CRLF.
  - The package also exports `escapeText`, `foldLine`, `formatUtc` and `formatDate`.
  
  Two corrections of the reader:
  
  - `unescapeText` reads each escape one time from left to right. Before, an escaped backslash before an `n` (`C:\\new`) became a line break.
  - The reader decodes the escapes of a `UID`, because a `UID` is a TEXT value.

### Patch Changes

- Updated dependencies [d919678]
- Updated dependencies [057d69a]
- Updated dependencies [b2a1a1e]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [afd6a19]
- Updated dependencies [057d69a]
- Updated dependencies [4e751da]
  - @procedures/client@0.4.0

## 0.3.0

### Minor Changes

- 5e2ba76: New package: `ics.parse`, `ics.occurrences` and `ics.fetch` read an iCalendar calendar and give the occurrences of its events in a time window, recurrences included.

### Patch Changes

- Updated dependencies [ddea529]
- Updated dependencies [b2a3e3a]
- Updated dependencies [a8c47f1]
- Updated dependencies [381ce3a]
- Updated dependencies [0c627f8]
- Updated dependencies [ae7f05f]
- Updated dependencies [7873940]
- Updated dependencies [a70d445]
- Updated dependencies [bc70357]
- Updated dependencies [07cc998]
- Updated dependencies [a6b01a9]
- Updated dependencies [c799cdd]
- Updated dependencies [540f8d9]
- Updated dependencies [b6daaec]
- Updated dependencies [5b9264e]
- Updated dependencies [956e88b]
- Updated dependencies [ff62281]
- Updated dependencies [d81d0ed]
- Updated dependencies [aa67cc7]
- Updated dependencies [061fa22]
- Updated dependencies [cfb9d69]
- Updated dependencies [43f7de5]
- Updated dependencies [b07bb50]
- Updated dependencies [4a3bfa1]
- Updated dependencies [bd0b626]
- Updated dependencies [a6be873]
- Updated dependencies [fb30718]
- Updated dependencies [c5528e4]
- Updated dependencies [fee5d9c]
- Updated dependencies [21f7743]
- Updated dependencies [31a0b46]
  - @procedures/client@0.3.0
