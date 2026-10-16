---
"@procedures/client": minor
---

`client.isObject` gives true only for a plain object: an object literal, or an object without a prototype. A `Date`, a `Map` or another class instance gives false. Before, each object that is not an array gave true.
