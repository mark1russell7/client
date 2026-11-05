---
"@procedures/mongo": patch
---

`MongoDocumentStorage.getChangesSince()` checks the floor of the change log again after its query. A prune of another process can no longer give a delta that misses a delete: that reader gets a full result. A delta read sends one more command.

The queue of the writes and the change reads of a collection now belongs to the client, not to the `Db` object. A store with no `db` option, or with a `db` option that makes a new `Db` at each call, had no queue. These stores now run their writes and change reads one at a time, as a store on one `Db` object does. The results do not change.

Throughput of these stores: a burst of writes on one collection now runs in order, and on a real MongoDB in CI this is faster, because the writes no longer conflict with each other. 100 writes at one time on one collection go from 93 to 317 writes a second, and 100 writes at one time on each of 100 collections go from 24 to 1,183 writes a second. In that last burst, 62 % of the writes ended in an error before this change, and none do now. A burst of change reads on these stores now also runs one read at a time, and goes from 896 to 442 reads a second. A store on one `Db` object keeps its write speed, and its delta reads take about 1.2 times as long.
