---
"@procedures/store": patch
---

The new entry `@procedures/store/browser` has the parts of the store that run in a browser (roadmap CLI-19). It exports `HybridStorage` with its errors, `ApiStorage`, `EventsChangeFeed` and all of `@procedures/store/indexeddb`. No module of the entry imports a module of Node. The entry does not have `FileProgramStore` or `FileQueueStore`, because they use `node:fs`.

`HybridStorage`, `ApiStorage` and `EventsChangeFeed` import `@procedures/client/browser` and not the root of the client, because the root imports `http` and `ws`. The classes are the same as the classes of the root. PATCH: the change adds an entry, and nothing changes for the existing imports.
