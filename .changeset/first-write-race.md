---
"@procedures/mongo": patch
---

`MongoDocumentStorage`: a plain write of a new id does not fail when another process writes that id at the same time. Before this fix, `set`, `setBatch` or `patch` could reject with a duplicate key, and the store kept the value of the other process. A batch also did not make the writes after the stopped write. The write tries again with the same number, so a reader does not pass it. A write with a guard keeps its conflict error. A real duplicate reaches the caller after one more try.
