---
"@procedures/client": patch
"@procedures/peer": patch
---

The client packages use the path codec in more places (roadmap O70).

- `@procedures/client`: the key of `defaultKeyGenerator()` uses `methodName()`. A path of one segment has the key of its operation, not `.operation`. The errors of `registerModules()` and `procedure.delete` give the path with `pathToKey()`.
- `@procedures/peer`: the discovery call makes its method with `pathToMethod()`.
- A type test makes sure that `createCacheMiddleware()` needs `methods`.
