---
"@procedures/mongo": patch
---

`MongoDocumentStorage` has the new option `sequence` (CLI-96). The default `collection` keeps one counter of the numbers for the collection. With `partition`, each partition has its own counter and its own write queue, so the writes of two partitions share no document.

- The gain is for the other partitions. One tenant wrote a burst in the CI tests of CLI-96. The p99 of the writes of the other tenants went from 316 to 758 ms to 12 to 51 ms.
- The rate of one partition does not change: approximately 400 writes a second. The stated limit of a partition is 200 writes a second.
- A live collection gains nothing. A store with the option refuses a collection with numbers on its counter of the collection, with a clear error. Use the option for a new collection. The move of a live collection is a step with all processes stopped.
- A store with the default refuses a collection whose stores have the option. Give the same `sequence` to each store of a collection, and to the storage of a view target.
- A first load of many tenants does not hold each schedule on each CPU model of the runners. The tail of the other tenants is the claim. A host that wants a warm pool for a first load sets `minPoolSize` of its client.
- The new option `writesInFlight` bounds the writes of each client at one time, over the stores with the same value. The default is 8. Before it, each partition of a process kept a transaction open at once, and the server queue reached 152 tickets with 20,000 partitions.
- The bound covers each store of a client, also with the default `sequence`. A client that writes more than 8 collections at once gets a queue for the permits. Set `writesInFlight: Infinity` to keep no bound.
- A watcher notes the writes of this process that it skips with their partition, because two partitions can have the same number.
