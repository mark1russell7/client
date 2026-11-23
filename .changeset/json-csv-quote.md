---
"@procedures/json": patch
---

`parseCsv` and the procedure `csv.parse` take a new option `quote`: the character around a field that has the delimiter, a line break or a quote. The default stays a double quote. Some government files put each field in single quotes. Use `quote: "'"` for them. With another quote, a double quote is a normal character, and it can be the delimiter.
