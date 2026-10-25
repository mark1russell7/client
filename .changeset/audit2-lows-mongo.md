---
"@procedures/mongo": patch
---

Fixes of the low findings of the second code audit (roadmap O57).

- A scoped pipeline: a first `$match` with `$text` takes the scope filter itself and stays the first stage.
- A scoped `$search` keeps its stage options (`highlight`, `count`, `sort`, `returnStoredSource`, `scoreDetails` and others) out of the compound operator.
- `MongoViewStorage.getBatch()` reads the view one time, so its ids and its filter are of one generation.
