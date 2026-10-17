---
"@procedures/json": minor
---

New CSV reader and writer (RFC 4180). The functions `parseCsv(text, options)` and `stringifyCsv(rows, options)` and the pure procedures `csv.parse` and `csv.stringify` read and write CSV text.

- The parse reads a quoted field with the delimiter, line breaks and doubled quotes (`""`). It reads CRLF, LF and CR, and it removes a byte order mark at the start.
- The options of the parse are `delimiter`, `header` (an object for each row), `trim` and `skipEmptyLines`.
- The writer writes arrays or objects. A field gets quotes only when it needs them. Each row ends with CRLF, or with LF when `lineBreak` is `"\n"`.
- Bad text and bad rows throw a `JsonError` with the new code `INVALID_CSV`.
- The MCP server of `@procedures/bundle-mcp` does not show the `csv` procedures as tools.
