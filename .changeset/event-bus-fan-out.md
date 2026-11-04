---
"@procedures/client": patch
---

`EventBusOptions` has a new option `fanOut`. With it, a channel with more handlers than `fanOut.sliceSize` delivers after `emit()` returns, in slices, so one event does not hold the event loop. Without it, nothing changes. `DefaultEventBus` has a new method `drained()`.
