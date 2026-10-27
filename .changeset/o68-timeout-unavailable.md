---
"@procedures/store": minor
---

`HybridStorage`: the default `isUnavailable` gives true for a `TIMEOUT` (roadmap O68). Before, a `write-through` write that timed out was undone and threw the `TIMEOUT`, though the remote can have applied it. At this time, the write stays in the local copy, goes in the queue, and throws `PendingWriteError`. The drain sends it again. The collection writes set or delete a value by id, so a second send gives the same item. With `versionOf`, the push sends the base version, and an earlier send that reached the remote is not a conflict. The push then sends the same value one more time, with the current version as its precondition. That write changes no value and no version, but a subscriber of the remote can get a second change event for the item.

Migration steps:

- The site: no step. It does not catch a `TIMEOUT` of a `HybridStorage` write.
- MiniMongo: no step, unless code catches a `TIMEOUT` of a `write-through` write to show an undo. That code gets `PendingWriteError`, with the `TIMEOUT` as its `cause`.
- Graph: the own `isUnavailable` that keeps `TIMEOUT` in the queue is not necessary at this time. Remove it, or keep it: the result is the same.
- jarvis: no step. To keep the old behavior, pass `isUnavailable: (error) => error?.retryable === true || error?.code === undefined`.
