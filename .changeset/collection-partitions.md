---
"@procedures/client": patch
---

The partitions of a collection (roadmap CLI-17). One `collections.<name>.*` surface serves several partitions, for example one for each tenant. The new option `partition` of `createCollectionProcedures()` resolves the partition of each call from its context, so the tenant comes from `ctx.principal`. The input can ask for a partition, and the resolver can refuse the call (`FORBIDDEN`, reason `partition-not-allowed`).

`ProcedureServer.usePartitions(name, storageOf)` gives the storage of each partition, through the new optional `getPartitionStorage` of `RepositoryProvider`. A repository without it refuses a partition. The events of a partition go to `collections.<name>.<partition>`, and `TopicCall` has the principal, so the `allow` of a publisher keeps each subscriber in its partitions. New exports: `PARTITION_PATTERN`, `collectionTopicPartition`, `PartitionInput` and `PartitionResolver`. Each change is additive.
