---
"@procedures/store": patch
---

`HybridStorage`: a queued write whose answer was lost does not go to the remote a second time (roadmap O69). The push gets `VERSION_CONFLICT`, and each id of the write is its echo: a set finds its own value, or a delete finds no item. At this time the write leaves the queue with no further send, and the base versions become the current versions. Thus the second change event of the resend is gone. When only some ids of a batch are echoes, the policy decides for the other ids, as before.
