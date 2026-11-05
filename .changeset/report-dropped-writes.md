---
"@procedures/store": patch
---

`HybridStorage` gets the optional hook `onDropped`. The hook gets each queued write that leaves the queue with no send that the remote took. The causes are a conflict that the policy `remote` decides, a delete of the remote, and a refusal. Before this change, a conflict gave only a count, and a refusal with no `onRefused` gave nothing. The hook gets the id, the value, the reason and the sync, once for each id. `getMetadata()` gives the count as `stats.dropped`. The default policy does not change.
