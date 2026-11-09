---
"@procedures/json": patch
---

The root entry exports `isPlainObject`. The function gives true for an object whose prototype is `Object.prototype` or null. An app can import it and delete its own copy.
