---
"@procedures/ics": minor
---

New iCalendar writer. The function `writeIcs(events, options)` and the pure procedure `ics.write` write a calendar from events. The reader `parseIcs` reads the text back to the same events.

- The writer writes `UID`, `DTSTAMP`, `DTSTART`, `DTEND`, `SUMMARY`, `LOCATION`, `DESCRIPTION`, `URL`, `RRULE`, `EXDATE`, `STATUS` and `SEQUENCE`. Each time is in UTC. An all-day event gets `VALUE=DATE`.
- The options set `PRODID`, `METHOD`, `CALSCALE`, `X-WR-CALNAME` and the `DTSTAMP`. `VERSION` is always `2.0`.
- The writer escapes `\`, `;`, `,` and each line break in a text value. It folds each line at 75 octets of UTF-8 and does not divide a character. Each line ends with CRLF.
- The package also exports `escapeText`, `foldLine`, `formatUtc` and `formatDate`.

Two corrections of the reader:

- `unescapeText` reads each escape one time from left to right. Before, an escaped backslash before an `n` (`C:\\new`) became a line break.
- The reader decodes the escapes of a `UID`, because a `UID` is a TEXT value.
