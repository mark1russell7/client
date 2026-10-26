---
"@procedures/store": patch
---

`HybridStorage`: a queued write that the remote refuses no longer blocks the queue (roadmap O67). Before, the push kept a refused write (for example `FORBIDDEN` or `VALIDATION_ERROR`) at the head of the queue and sent it again at each drain. A new write in `write-through` mode then failed too. Now the refused write leaves the queue, the local copy gets the remote values of its ids again, and the push goes on. The new optional option `isRefusal` tells which errors are refusals. Its default codes are `FORBIDDEN`, `VALIDATION_ERROR`, `INVALID_REQUEST`, `NOT_EXPOSED` and `NOT_DECLARED`. The new optional hook `onRefused` gets each refusal. Another error, for example `TIMEOUT` or `UNAUTHORIZED`, keeps the write in the queue, as before.
