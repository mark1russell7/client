---
"@procedures/client": patch
"@procedures/server": patch
---

Add live state. The option `live` of `events` gives a host the procedures `live.set`, `live.snapshot` and `live.leave`. They keep keyed values in memory on a topic. A key ends at its expiry, at the close of its connection or at a leave call. A window joins the changes of a topic. `liveView()` is the reader. PATCH: new exports and new procedures that a host turns on, and no existing result changes.
