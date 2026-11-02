---
"@procedures/mark": patch
---

O90: the `mark` executable enables the compile cache of Node.js before it loads the CLI. The cache folder is `mark/compile-cache` in the cache folder of the user. In CI, one call took 1019 ms with no cache and 754 ms with a warm cache. `NODE_COMPILE_CACHE` and `NODE_DISABLE_COMPILE_CACHE` still control the cache.
