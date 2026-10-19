---
"@procedures/client": minor
---

The name of a collection with partitions can have a dot (roadmap CLI-42). In the topic of a partition, the name encodes `%` and `.`, so the name and the partition of each topic stay apart. This change is a break of the server stack, thus it is its own MINOR (decision D13, decision D22). No earlier release marks it as deprecated, because no export moves. Only the topic form of these names changes.

Before, `usePartitions` refused a name with a dot, because the topic `collections.<name>.<partition>` did not show where the name ends.

- In the topic of a partition, the name encodes `%` as `%25` and `.` as `%2E`. The first dot after the name thus ends the name. The partition stays as it is, and it can have each character, also `.`, `/` and `%`.
- `collectionChangeTopic()` makes each topic, and `collectionTopicPartition()` reads it back to the same name and the same partition.
- Only the canonical form of a topic counts. The parse gives a collection and a partition only when `collectionChangeTopic()` gives the same topic again. Thus `collections.a%2eb.t1` names no collection.
- `collectionTopicTarget()`, `collectionTopicReads()` and `EventPublisher` use the same parse. `collectionTopicReads(topic, repository)` takes the repository, as the default read check of the publisher does.
- New `collectionTopicRule(name)`: the topic rule of a collection for the option `topics` of `EventPublisher`. It gives the plain topic and the pattern of the topics of the partitions, for example `["collections.graph.nodes", "collections.graph%2Enodes.*"]`.
- The topic of a partition of a name without `%` and `.` does not change. The topic of a collection without a partition does not change.

The behavior that changes:

- A collection with partitions whose name has `%` gets a new topic for each partition. For example, the topic of the partition `t1` of `rate%` changes from `collections.rate%.t1` to `collections.rate%25.t1`.
- A collection with partitions whose name has `.` is new. Its topics of a partition have the encoded name, for example `collections.graph%2Enodes.acme/space`. A topic or a rule that joins the raw name, for example `collections.graph.nodes.*`, matches none of them.
- In a deployment with two versions, an old publisher and a new subscriber of such a name do not match. The reverse is also true.
- `collectionTopicReads()` gives no read for a topic that names no collection, for example `collections.notes.` with an empty partition.

Migration steps:

- For each collection with partitions whose name has `%` or `.`, upgrade the publishers and the subscribers together.
- Build each topic rule of a collection with `collectionTopicRule()`. Do not join the parts yourself.
- The site: no change is necessary. It has no collection with partitions.
- MiniMongo: no change is necessary. It has no collection with partitions.
- Graph: no change is necessary. Graph has dotted names of collections, but no dotted name has partitions yet. When a dotted name gets partitions, build the rule of `graph-host.ts` with `collectionTopicRule()`, not `collections.${c}.*`.
- jarvis: no change is necessary. It has no collection with partitions.
