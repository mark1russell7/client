---
"@procedures/mongo": minor
---

**Breaking.** `MongoDocumentStorage.getChangesSince()` does not wait for a write of the same process. A change read goes next to the writes of a collection. So a burst of writes with a subscriber keeps its replies.

A write that has ended is in each later read, as before. A write that has not ended is in this read or in the next read. The mark of a read stops below each write in flight. A full answer beside a write can hold that write above its mark, and the next delta gives it again. A second time has the same value or a later value, so apply a change by its id.

To migrate: find each `set()` with no `await` before `getChangesSince()` in the same tick. If the read must have the write, `await` the write before the read. A caller that follows a cursor changes nothing.
