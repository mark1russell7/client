---
"@procedures/client": patch
"@procedures/peer": patch
---

Add live state. The option `live` of `events` gives a host the procedures `live.set`, `live.snapshot` and `live.leave`. They keep keyed values in memory on a topic. A key ends at its expiry, at the close of its connection or at a leave call. A window joins the changes of a topic. `liveView()` is the reader. PATCH: new exports and new procedures that a host turns on, and no existing result changes.

An overload fault stays open in this release: CLI-102, https://github.com/mark1russell7/client/pull/444. It applies to a collection store with change events on and a subscriber. Change events are on by default. When writes arrive faster than the store serves them, the replies of the writes fall far behind. Live state does not use this path.
