---
"@procedures/client": patch
---

The writes of a collection that end while a change read runs share the next read. A write still resolves after its event is on the bus. Before this change, each write under sustained load had its own read, so the replies fell to one for each read.
