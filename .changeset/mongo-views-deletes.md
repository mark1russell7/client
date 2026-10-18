---
"@procedures/mongo": patch
---

`ViewMaterializer`: a change reaches only the views of its partition when the partition is known (roadmap CLI-37). The filter only removes work: a change whose partition is unknown reaches the views of each partition, as before.

- A delete has no document in its change event. Its partition comes from the pre-image, when its collection has `changeStreamPreAndPostImages`.
- The new option `storageSources` gives, for a collection of `MongoDocumentStorage`, the function from the storage partition (at the start of the id) to the partition of the views. `identityPartition` is for two partitions that are the same.
- With pre-images, an update that moves a document to another partition also reaches the views of its old partition.
- Without pre-images, a replace and an update of the partition field reach the views of each partition, as a delete does. The document can leave any partition.
- With `sourceFields`, the keys of an update are paths with dots: a `$push` (`tags.3`), a `$set` of `a.b`, a removal or a truncated array. Each key counts at the field, under it or above it, and the positions in arrays do not count (`lines.0.price` is `lines.price`). An update of the partition field starts a pass too.
