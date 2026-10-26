---
"@procedures/store": patch
---

`HybridStorage`: a queued write that the remote refuses no longer blocks the queue (roadmap O67). Before, the push kept a refused write (for example `FORBIDDEN` or `VALIDATION_ERROR`) at the head of the queue and sent it again at each drain. A new write in `write-through` mode then failed too. Now the refused write leaves the queue, the local copy gets the remote values of its ids again, and the push goes on. The new optional hook `onRefused` gets each refusal. A write that the remote cannot take at this time (`isUnavailable` gives true) stays in the queue, as before.
