---
"@procedures/client": patch
---

The cache middleware gives two calls that differ only in a Date two cache keys (CLI-128). Before this fix, `stableStringify` gave the text `{}` for each Date, RegExp, Map and Set. Two calls with other `since` dates got one key, so the second call got the cached response of the first.

The key of a payload with one of these values changes, so the cache misses its old entries one time. The keys of the other payloads do not change.
