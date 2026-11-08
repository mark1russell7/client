---
"@procedures/client": patch
"@procedures/mongo": patch
---

The mongo store limits its change reads and its passes of the views with `semaphore()` of `@mark1russell7/collections`, the home of the semaphore. The behavior does not change: the permits go to the callers in FIFO order.

The class `Semaphore` of `@procedures/client` is deprecated. Use `semaphore(permits)` of `@mark1russell7/collections` in its place. Its `run(task)` replaces `withPermit(fn)`, and its `acquire()` gives the release function. The next MINOR break of `@procedures/client` removes the class.
