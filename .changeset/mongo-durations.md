---
"@procedures/mongo": patch
---

The time options of the new storage APIs take a `Duration` of `@procedures/client`, as the other time options of the client do (roadmap R11). A plain number is a `TypeError`.

- `MongoDocumentStorage`: the option `writeLease` (default `seconds(60)`) replaces `writeLeaseMs`.
- `MongoDocumentStorage.aggregate()` and `PipelineLimits`: `maxTime` (default `seconds(10)`) replaces `maxTimeMS`. `DEFAULT_PIPELINE_LIMITS` has `maxTime`.

These APIs are new in this release, so no released code changes. The procedure `mongo.documents.aggregate` keeps its input `maxTimeMS` in milliseconds: the wire keeps milliseconds.
