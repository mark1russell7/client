---
"@procedures/client": patch
---

The cache middleware keeps its entries in `LRUCache` of `@mark1russell7/collections`, the home of the LRU cache (roadmap O98). The core removes its own `LruMap`. `LRUCache` checks the capacity and has `deleteWhere`, so the behavior does not change. A capacity that is not a positive whole number throws a `RangeError`, as before. An esbuild bundle for a browser gets 1075 more bytes of minified code, 478 bytes of gzip.
