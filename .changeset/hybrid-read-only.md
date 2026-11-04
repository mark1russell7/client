---
"@procedures/store": patch
---

`HybridStorage` has a new mode `read-only`. It refuses each write with `ReadOnlyError` at once, with no change of the local copy, the queue or the remote. Reads, pulls and the feed work as in `write-through`. `HybridMode` has a new value, so an exhaustive `switch` on it needs a new case.
