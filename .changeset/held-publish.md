---
"@procedures/client": patch
"@procedures/collections": patch
"@procedures/mongo": patch
---

A write that a write in flight holds back reaches its subscribers with no later write. `StorageChanges` has a new optional field `held`. The docs state that a result gives each write at least one time. They name the two cases of a second time. A read of the log with no change does not move the `since` of the next event, so the events keep their chain.
