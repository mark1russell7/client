---
"@procedures/client": patch
---

The writes of a collection that end while a change read runs share the next read. A write still resolves after its event is on the bus. Before this change, each write under sustained load had its own read, so the replies fell to one for each read.

This change does not close the fault of a store under overload with a subscriber (CLI-102). On one run at 100 writers, the replies were 38.2 percent of a copy with no subscriber, and the pass line is 70 percent. So the change read must leave the queue of the writes.
