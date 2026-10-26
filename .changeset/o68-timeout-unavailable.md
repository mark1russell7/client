---
"@procedures/store": minor
---

`HybridStorage`: the default `isUnavailable` gives true for a `TIMEOUT` (roadmap O68). Before, a `write-through` write that timed out was undone and threw the `TIMEOUT`, though the remote can have applied it. Now the write stays in the local copy, goes in the queue, and throws `PendingWriteError`. The drain sends it again. The collection writes set or delete a value by id, so a second send gives the same item. With `versionOf`, the push sends the base version, and an earlier send that reached the remote is not a conflict.

Migration steps:

- The site: no step. It does not catch a `TIMEOUT` of a `HybridStorage` write.
- MiniMongo: no step, unless code catches a `TIMEOUT` of a `write-through` write to show an undo. That code now gets `PendingWriteError`, with the `TIMEOUT` as its `cause`.
- Graph: the own `isUnavailable` that keeps `TIMEOUT` in the queue is not necessary now. Remove it, or keep it: the result is the same.
- jarvis: no step. To keep the old behavior, pass `isUnavailable: (error) => error?.retryable === true || error?.code === undefined`.
