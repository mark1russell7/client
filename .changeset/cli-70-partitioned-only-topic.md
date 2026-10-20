---
"@procedures/client": patch
---

The publisher refuses a subscriber of a collection `a.b` with partitions and no storage when its resolver gives no partition and `a` has partitions. Before, that subscriber listened to the plain topic `collections.a.b`. That is also the topic of the partition `b` of `a`. Thus the subscriber got the events of the tenant `b` of `a`, a leak across tenants (roadmap CLI-70, decision D23).

- The refusal is `FORBIDDEN` with the reason `partition-not-allowed`, as for the other refusals of a partition.
- The publisher does the check at the start of the subscription, at each re-check and before each event. Thus partitions of `a` that come later also end an open subscription, before it gets an event of `a`.
- The check is in the one route from the topic of a subscriber to the topic of the bus. Thus each subscriber over HTTP, WebSocket or MCP gets it.
- The registration check of CLI-57 cannot find this pair, because the resolver gives the partition only at the call. The calls of `a.b` without a partition already failed, because `a.b` has no storage.
- A subscriber of `a.b` whose resolver gives a partition does not change. A subscriber of `a` does not change. A collection `a.b` without the partitions of `a` does not change.

PATCH (decision D23): the change refuses only a subscription that gets the events of another tenant. No correct subscriber can rely on it. Each other subscription behaves as before.

Migration steps:

- Does a subscriber of `a.b` get `FORBIDDEN` with the reason `partition-not-allowed`? Then make the resolver of `a.b` give a partition. Or rename `a.b` to a name without a dot, for example `a_b`.
- The site: no change is necessary. It serves no collection.
- MiniMongo: no change is necessary. Its server serves no collection.
- Graph: no change is necessary. Its one served collection, `examples`, has no dot in its name.
- jarvis: no change is necessary. Its host serves no collection.
