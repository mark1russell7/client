---
"@procedures/client": patch
---

A stream of `invokeProcedure` reads its items in the same time at any count of streams that share one signal. Before, each read of an item added a listener to the signal of the call and removed it again. Node examines each listener of a signal at each add, so a publish to n subscriptions with one signal cost n x n. With this change, each stream derives its own signal one time with `AbortSignal.any`. The server faces give each call its own signal, so the change helps the callers in one process that share a signal. An abort of the shared signal still ends each stream.
