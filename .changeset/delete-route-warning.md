---
"@procedures/mongo": patch
---

`ViewMaterializer` writes one warning for a source of many partitions that has no pre-image and no entry in `storageSources`, because a delete in that source runs a pass in each partition. The routes of the changes do not change.
