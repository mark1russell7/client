---
"@procedures/client": patch
---

`segmentsToTopic()` builds its text in a loop and makes no array. `decodeSegment()` returns a segment without `%` at once. The keys of paths and topics stay the same.
