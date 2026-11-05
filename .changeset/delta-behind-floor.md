---
"@procedures/mongo": patch
---

`MongoDocumentStorage.getChangesSince()` checks the floor of the change log again after its query. A prune of another process can no longer give a delta that misses a delete: that reader gets a full result. A delta read with changes sends one more command.
