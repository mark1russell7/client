---
"@procedures/ics": patch
---

Two additions for the calendar dates and the feeds.

- New `shiftMonth(date, months)` gives the date `months` months after a date (`YYYY-MM-DD`). When the month of the result does not have the day, the result is its last day: one month after `2026-01-31` is `2026-02-28`. For the arithmetic of `Date.UTC`, add the days to the 1st with `shiftDay`.
- `fetchCalendar` has a new option `fetch`, the fourth argument. It replaces the global `fetch`, as the option `fetch` of `drivingRoute` in `@procedures/geo` does.
- The README lists `localTime`, `weekdayOf` and `weekdayName`, which came in 0.7.0.
