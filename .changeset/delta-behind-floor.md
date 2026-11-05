---
"@procedures/mongo": patch
---

`MongoDocumentStorage.getChangesSince()` checks the floor of the change log again after its query. A prune of another process can no longer give a delta that misses a delete: that reader gets a full result. A delta read sends one more command.

The queue of the writes and the change reads of a collection now belongs to the client, not to the `Db` object. A store with no `db` option, or with a `db` option that makes a new `Db` at each call, had no queue. These stores now run their writes and change reads one at a time, as a store on one `Db` object does. The results do not change.
