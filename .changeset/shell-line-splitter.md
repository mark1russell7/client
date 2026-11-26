---
"@procedures/shell": patch
---

The entry `@procedures/shell/command` exports its line splitter, and `streamCommand` takes a stream as stdin.

- `createLineSplitter(options)` splits chunks of output into lines, as `streamCommand` does. A line ends at `\n` or `\r\n`. A character that a chunk cuts waits for the next chunk. A line longer than `maxLineLength` comes out in parts. It has no I/O.
- `DEFAULT_MAX_LINE_LENGTH` is the default `maxLineLength`: 1 MiB.
- The `input` of `streamCommand` can be a `Readable`. The helper pipes it to stdin, and the end of the stream ends stdin. The helper does not end or destroy the stream.
- `streamCommand` uses the splitter. At the end of the output, a last `\r` with no `\n` after it is no longer part of the line.
- A fix of `streamCommand`: a line whose length is a multiple of `maxLineLength` no longer gives an empty line after its parts.

This is a PATCH: new exports, a wider option type and a fix before 1.0.0, and no change to the other exports.
