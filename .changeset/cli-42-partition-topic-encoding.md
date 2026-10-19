---
"@procedures/client": patch
---

New: the name of a collection with partitions can have a dot (roadmap CLI-42). Before, `usePartitions` refused a name with a dot, because the topic `collections.<name>.<partition>` did not show where the name ends. Now, in the topic of a partition, the name encodes `%` as `%25` and `.` as `%2E`, so the first dot after the name ends it. The partition stays as it is, and it can have each character, also `.`, `/` and `%`. `collectionChangeTopic()` makes each topic, and `collectionTopicPartition()` reads it back to the same name and the same partition. `collectionTopicTarget()`, `collectionTopicReads()` and `EventPublisher` use the same parse. The topic of a partition of a name without `.` and `%` does not change, and the topic of a collection without a partition does not change.
