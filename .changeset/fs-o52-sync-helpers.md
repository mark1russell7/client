---
"@procedures/fs": patch
---

Sync forms, the last line, the name of the temporary file and a clearer error for a long line in `@procedures/fs/files` (roadmap O52, the feedback of jarvis PR #86).

PATCH: new functions, new options and a new optional field of a result before 1.0.0. No default changes.

- `writeFileAtomicSync(path, data, options?)` is the sync form of `writeFileAtomic()`, with the same steps. On Windows, it tries the rename of a locked target again for `renameRetryMs`, with a short wait of `Atomics.wait()` between the tries.
- `healNdjsonTailSync(path, options?)` is the sync form of `healNdjsonTail()`, with the same repairs, result and errors.
- The new option `lastLine: true` of the two heal functions adds `lastLine` to the result: the last complete line after the repair, without its newline, or `undefined` for a file without a complete line. The function reads it from the tail only. Without the option, the heal of a file that ends in a newline still reads one byte.
- The error of a last line longer than `maxLineBytes` is still a `RangeError`. It now has the code `ERR_NDJSON_LINE_TOO_LONG` (the export `NDJSON_LINE_TOO_LONG`) and the fields `path`, `lineBytes` and `maxLineBytes`. Its text gives the length, the limit and the option, and tells that `Infinity` turns the limit off. To give the length, the function reads back to the start of the line, without a copy in memory.
- The new option `tempName(target)` of `writeFileAtomic()`, `writeFileAtomicSync()` and `editFile()` gives the name of the temporary file. A name with `/` or `\` is a `TypeError` with the code `ERR_INVALID_ARG_VALUE`. The default name stays `.<name>.<16 hex digits>.tmp`.
- When the group and the others cannot read the final file, the temporary file now starts with the mode `0o600`. Then the function sets the final mode before the rename.
- The async and the sync forms share one set of steps, so their edge cases are the same.
