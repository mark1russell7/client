---
"@procedures/store": patch
---

Added: `IndexedDbStorage`, a collection storage in the IndexedDB of a browser (roadmap CLI-22). It is in `@procedures/store/indexeddb` and `@procedures/store/browser`. It is the durable local copy of a `HybridStorage` in a browser app without SignalDB.

- Each collection has its own database. The items, their order and the versions of `getChangesSince()` stay after a reload of the page.
- The entries keep the order of the first set of each id, as a `Map` does.
- Each write is one transaction of IndexedDB. A batch that fails changes nothing, and two patches at the same time keep each field.
- The storage has `getEntries()`, `getIds()`, `getChangesSince()`, `query()`, `observe()` and `patch()`. With the option `versionOf`, a write can expect the version of the current item.
- The storage checks each record that it reads. The contract suite of `@procedures/collections/testing` tests it.
- The entry `@procedures/store/indexeddb` still does not import the root of the client or zod.

PATCH: a new export that is backward compatible, before 1.0.0.
