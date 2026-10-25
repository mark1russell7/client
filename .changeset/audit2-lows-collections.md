---
"@procedures/collections": patch
---

Fixes of the low findings of the second code audit (roadmap O57).

- `AsyncQueue.peek()` on an empty queue takes no element. Before, a take that waited after it kept waiting, and the order changed.
- `pipeline()` and `fanOut()` close their outputs when the transform or a send fails, and `fanIn()` closes its output after a failed input. The error goes to the console.
- A `readonly` collection runs its read methods on the collection. A read of a `LinkedHashMap` with `accessOrder` no longer throws.
- `boundedList` with `drop-oldest`: an `unshift` drops one element, the last one. `insert` and `insertAll` use the index of the caller after the drop.
