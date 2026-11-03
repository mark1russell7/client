---
"@procedures/client": patch
---

`encodeSegment()`, `decodeSegment()` and `segmentsToTopic()` return early for a segment without `.` and `%`, and `segmentsToTopic()` builds the key in a loop. The keys of paths and topics stay the same.
