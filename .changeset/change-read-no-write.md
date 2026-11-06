---
"@procedures/mongo": patch
---

`MongoDocumentStorage.getChangesSince()` writes only the first counter of a collection, and one command reads the counter and the floor. A delta read with no change sends one command. Change reads of a collection go next to each other, within one twelfth of the pool (8 reads at the default pool of 100). A larger pool gives more reads at one time. A read and a write keep the order of their calls.
