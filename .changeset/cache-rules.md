---
"@procedures/client": minor
---

The cache (roadmap R13). Two calls with the same key at the same time make one request: the second one waits for the first and gets a copy. With the new option `effects` (for example `effectsIn(registry)`), a write that succeeds deletes the cached entries of the methods that read one of its resources. `invalidateCache(middleware, matches?)` deletes entries by method. A response whose key changed during the call is not stored, so an auth layer inside the cache cannot give the response of one user to another. The idempotency key and the remaining time of a call are not part of the key.
