---
"@procedures/client": patch
---

`@procedures/client` has `errorMessage(error)`. It gives the `message` of an `Error`, else `String(value)`. When `String(value)` throws, it gives `Object.prototype.toString.call(value)`. The function does not throw an error. The root, `./browser` and `./client` entries export it. The change adds a name only, so it is a patch.
