---
"@procedures/client": patch
---

The cache middleware and `hashOf` use `canonicalJson` of `@mark1russell7/rigor-generators` for their text (CLI-128). The two local copies of this function are removed.

- **Cache keys:** two calls that differ only in a `Date`, a `RegExp`, a `Map` or a `Set` get two keys. Before this fix, the key of each of these values was `{}`. The second call got the cached response of the first call.
- **A call with no key:** when the key generator throws, the call goes past the cache, with no read and no store. The default generator throws for a function, a symbol or a cycle in the payload or the metadata.
- **`hashOf`:** a JSON value keeps its hash, so the hash of a manifest does not change. A value with a function, a symbol or a cycle causes a `TypeError`.
