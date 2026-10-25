---
"@procedures/fs": patch
---

Four file helpers in the new entry `@procedures/fs/files` (roadmap O51). The package root exports them too.

PATCH: new exports before 1.0.0. No export or behavior changes.

- `writeFileAtomic(path, data, options?)` writes a temporary file in the folder of the target, flushes it and renames it over the target. After a failure, it removes the temporary file. The file keeps the permissions of the target, unless `mode` is set. On Windows, it tries the rename again after `EPERM`, `EACCES` or `EBUSY` for `renameRetryMs` (2000 by default), and it does not flush the folder.
- `healNdjsonTail(path, options?)` repairs the end of an append-only NDJSON file after a crash. It reads only the last line from the end. It cuts off a part of a line with `ftruncate`, and it adds the newline to a complete last record. It gives `{ action: "none" | "truncated" | "newline", bytes, size }`.
- `KeyedLock` and `withLock(key, fn, options?)` let one caller at a time hold a key in the process. The waiters get the key in the order of their calls. With `ifHeld: "skip"`, the call gives `{ ran: false }` when the key has a holder. A `signal` stops a wait. A key without a holder uses no memory.
- `editFile(path, transform, options?)` reads a file, waits for `transform` and writes the result with `writeFileAtomic()`, one edit at a time for each path. A missing file gives `initial` or `undefined`. The same text or `undefined` writes nothing.

jarvis has copies of these helpers since jarvis PR #85 (`TODO(@procedures)`). It can use the package after the release.
