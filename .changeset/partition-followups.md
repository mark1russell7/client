---
"@procedures/client": patch
---

The partitions of a collection (roadmap CLI-17), two follow-ups of the review. A collection without partitions can have a dot in its name, and its topic `collections.<name>` stays a plain topic. `usePartitions` refuses a name with a dot, because the topic names the partition after the first dot. The documentation of `PartitionResolver` gives its contract: a partition of the caller or `null`, and not the partition of another tenant.
