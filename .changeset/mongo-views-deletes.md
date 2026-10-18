---
"@procedures/mongo": patch
---

`ViewMaterializer`: a delete reaches only the views of its partition when the partition is known (roadmap CLI-37). A delete has no document in its change event. The partition comes from the pre-image of the document, when its collection has `changeStreamPreAndPostImages`. Else it comes from the id of a `MongoDocumentStorage` document (the partition, U+001F, the id). When neither tells the partition, the delete reaches the views of each partition, as before.
