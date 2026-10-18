---
"@procedures/client": patch
---

The partitions of a collection (roadmap CLI-17). One `collections.<name>.*` surface serves several partitions, for example one for each tenant. `ProcedureServer.usePartitions(name, { storageOf, resolve })` registers the storage of each partition and the resolver. The resolver gives the partition of each call from its context, so the tenant comes from `ctx.principal`. The input can ask for a partition, and the resolver can refuse the call (`FORBIDDEN`, reason `partition-not-allowed`).

`RepositoryProvider` has the new optional methods `getPartitionStorage`, `hasPartitions` and `resolvePartition`. A repository without them refuses a partition. The events of a partition go to `collections.<name>.<partition>`.

A subscriber of `EventPublisher` names the partition that it asks for, and the publisher resolves it with the same resolver. So a subscriber cannot name the topic of another tenant. A change of behavior for safety: a topic `collections.<name>.<partition>` of a collection without partitions is refused. Before, each subscriber with the read of the collection got it. New exports: `PARTITION_PATTERN`, `collectionTopicPartition`, `CollectionPartitions`, `PartitionInput` and `PartitionResolver`.
