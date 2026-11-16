---
"@procedures/client": patch
"@procedures/s3": patch
---

The new function `permitsEffects(capability, effects)` of `@procedures/client` gives true when a capability permits the reads and the writes of `effects`. A capability without `effects` permits all effects. `permitsUpload()` of `@procedures/s3` uses it, with the same result.
