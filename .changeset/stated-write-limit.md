---
"@procedures/mongo": patch
---

The guide of `MongoDocumentStorage` states a write limit: 200 writes a second on one collection, with a p99 of 12 ms for 1 process and 39.5 ms for 4. The limit is provisional. At 400 writes a second the p99 is 414.8 ms, so that rate has no margin, and the rate stops near 412 writes a second.
