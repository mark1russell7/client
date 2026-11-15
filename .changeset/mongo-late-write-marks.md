---
"@procedures/mongo": patch
---

`MongoDocumentStorage` on the path of pending numbers: a late write does not give a subscriber an older value after a newer value. A late write lands after its lease. Before, a late write could land in the rows of a read after the mark of that read. An event since that mark, read before the landing, then gave an older value of the row. The move of the late write gave the newer value again later.

An expired pending range stays in the counter for 10 leases, and for 60 s at least. When a read finds a row in such a range, it takes marks again until the mark stops. With no late write, a read has no added cost. After 8 marks that do not stop, the read gives a version with a third part, so no event starts at it. A read since such a version reads since its number.

PATCH: a fix of the change log of the store. The public API does not change.
