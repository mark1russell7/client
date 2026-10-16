---
"@procedures/client": patch
---

The object procedures do not reach a prototype (roadmap R6). `client.set`, `client.get` and `client.has` refuse a path segment `__proto__`, `constructor` or `prototype`: before, `client.set` with the path `__proto__.x` changed the prototype of its result. `client.get`, `client.has` and `client.pick` read only own fields: before, `toString` gave a function of the prototype. `client.merge` and `client.omit` set own data properties.
