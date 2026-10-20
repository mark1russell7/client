---
"@procedures/client": patch
---

A host that serves a plain collection `a.b` and a collection `a` with partitions fails at registration. To correct it, rename the plain collection. Before, the two had the same topic `collections.a.b`. Thus the readers of `a.b` got the events of the tenant `b` of `a`, a leak across tenants (roadmap CLI-57, decision D23).

- The refusal is the new export `CollectionTopicCollisionError`. It names the two collections, the partition and the topic.
- `useStorage`, `useStorages`, the option `collections` of a host and `usePartitions` do the check. The check finds the pair in each order, also when the registrations come at different times.
- The check also refuses a deeper name, for example `a.b.c` next to `a` with partitions: `b.c` is a partition of `a`.
- The check also refuses a storage of `a.b` for the calls without a partition while `a` has partitions, also when `a.b` has partitions. That storage publishes on `collections.a.b`.
- A name without a dot does not change. A dotted name without a partitioned prefix does not change. Two collections with partitions, for example `a` and `a.b`, do not change, because the partitions of `a.b` encode its name.

PATCH (decision D23): the change refuses only a configuration that leaks events across tenants, so no caller can rely on it. Each correct configuration behaves as before.

Migration steps:

- When a host fails with `CollectionTopicCollisionError`, rename the plain collection, for example `a.b` to `a_b`. A name without a dot has no topic of a partition.
- The site: no change is necessary. It serves no collection.
- MiniMongo: no change is necessary. Its server serves no collection.
- Graph: no change is necessary. Its host gives partitions to each served collection (`examples`), and no collection has a plain storage.
- jarvis: no change is necessary. Its host serves no collection.
