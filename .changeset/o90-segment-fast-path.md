---
"@procedures/client": patch
---

`encodeSegment()` returns a segment without `.` and `%` at once, without a replace with a callback. The keys of paths and topics stay the same.
