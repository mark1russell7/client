---
"@procedures/mongo": patch
---

`MongoDocumentStorage.getChangesSince()` writes only the first counter of a collection, and one command reads the counter and the floor. A delta read with no change sends one command. Change reads of a collection now run next to each other, within one third of the pool (at most 32). A read and a write keep the order of their calls.
