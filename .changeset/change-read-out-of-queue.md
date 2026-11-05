---
"@procedures/mongo": minor
---

**Breaking.** `MongoDocumentStorage.getChangesSince()` does not wait for a write of the same process. A change read goes next to the writes of a collection. So a burst of writes with a subscriber keeps its replies.

A write that has ended is in each later read, as before. A write that has not ended is in this read or in the next read, one time. The mark of a read stops below each write in flight.

To migrate: a caller that sends `set()` with no `await` and then calls `getChangesSince()` in the same tick must `await` the write before the read, if the read must have the write. A caller that follows a cursor changes nothing.
