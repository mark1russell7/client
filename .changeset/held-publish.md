---
"@procedures/client": patch
"@procedures/collections": patch
"@procedures/mongo": patch
---

A write that a write in flight holds back reaches its subscribers with no later write. `StorageChanges` has a new optional field `held`, and the docs state that a result gives each write at least one time, and name the two cases of a second time.
