---
"@procedures/store": patch
---

The option `pushBatch` of `HybridStorage` merges queued writes into one batch for each send (roadmap CLI-121). The push sends the run of queued sets at the head of the queue as one `setBatch`. It sends the run of deletes as one `deleteBatch`. A first sync of many writes thus makes few remote calls.

The caps `maxItems` (default 100) and `maxBytes` (default 1 MiB of JSON) limit each send. A queued batch over the caps goes as batches within the caps. Thus a flush stays within the capacity of a remote limit, when the caps are within it. A refused or conflicting merged batch goes again as its separate writes. Thus `onRefused`, `onDropped` and the conflict policy get the same writes as without the merge. Without the option, the push sends each queued write alone, as before.
