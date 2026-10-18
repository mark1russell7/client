---
"@procedures/mongo": patch
---

New `scopePipeline()`: the guard of an aggregation pipeline over shared collections. The filter of the scope goes on each read of the pipeline and of its sub-pipelines. `$out`, the stages of the server and the JavaScript operators of the server are refused, and `$merge` needs a stamp. New `boundPipeline()`, `cutResults()` and `isTimeLimitError()` give the limits of time and size.

New `MongoDocumentStorage.aggregate()`: a read-only pipeline on the items of the partition, with these limits. The code comes from the server of Graph (its split plan, part P3).
