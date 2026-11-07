---
"@procedures/mongo": patch
---

`watchDatabaseChanges` keeps the first token of a stream until the stream gives its first event.

Before, a fault of the first read after `ready` opened the next stream without a token, at the present time. The changes between `ready` and that fault were lost. With this fix, the watcher opens the next stream at the first token. An event over the BSON limit with no split stage stops the watcher, as the documentation states.
