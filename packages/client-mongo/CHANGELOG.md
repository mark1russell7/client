# @procedures/mongo

## 0.8.0

### Patch Changes

- Updated dependencies [4b09a03]
- Updated dependencies [4b09a03]
- Updated dependencies [aa6e3aa]
- Updated dependencies [698e24d]
- Updated dependencies [4b09a03]
- Updated dependencies [600c497]
- Updated dependencies [7c2e7f7]
- Updated dependencies [90ea741]
- Updated dependencies [c4cfa34]
- Updated dependencies [d25805a]
  - @procedures/client@0.8.0
  - @procedures/collections@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [5837c2d]
- Updated dependencies [841d083]
- Updated dependencies [389b054]
  - @procedures/collections@0.7.0
  - @procedures/client@0.7.0

## 0.6.0

### Patch Changes

- @procedures/client@0.6.0
  - @procedures/collections@0.6.0

## 0.5.0

### Minor Changes

- bc74091: After `close()`, each operation of `SqliteStorage` and `MongoStorage` rejects with an error that says "closed", and a second `close()` does nothing. Before, `SqliteStorage.flush()` and an empty batch resolved after `close()`, and `MongoStorage` kept working.

### Patch Changes

- Updated dependencies [0f75644]
- Updated dependencies [09e5566]
- Updated dependencies [ab77f75]
- Updated dependencies [a47bee6]
- Updated dependencies [bc74091]
- Updated dependencies [bc74091]
- Updated dependencies [89481b0]
  - @procedures/client@0.5.0
  - @procedures/collections@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [d919678]
- Updated dependencies [057d69a]
- Updated dependencies [b2a1a1e]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [057d69a]
- Updated dependencies [afd6a19]
- Updated dependencies [057d69a]
- Updated dependencies [0abf2ec]
- Updated dependencies [4e751da]
  - @procedures/client@0.4.0
  - @procedures/collections@0.4.0

## 0.3.0

### Minor Changes

- c799cdd: `HybridStorage` cannot lose data (roadmap R2). A sync gets the ids of the remote items from the new `getEntries()` of a storage (the collection procedure `collections.<name>.entries`), or else from `keyOf`. A remote item without a key stops the sync with `MissingKeysError` before any change: before, such a list emptied the local cache. A write-through that the remote cannot take waits in the queue and throws `PendingWriteError`, and a timer sends the queue. A write that the remote refuses is undone in the local cache. A full queue refuses a write with `QueueFullError`: before, it dropped the oldest operation. A second try of a write replaces its queued operation. A write-through sends the older queued operations first. The reads wait for the first sync.
- 3aa6495: Four procedures (roadmap R44). `mongo.documents.distinct` gives the distinct values of a field. `mongo.documents.bulk` sends `insertOne`, `updateOne`, `updateMany`, `deleteOne` and `deleteMany` operations in one request, in order by default. An empty filter of an update or a delete needs `confirm: true`. `mongo.documents.explain` gives the plan of a find or an aggregation, and refuses `$out` and `$merge`.
  
  `mongo.watch` gives the changes of a collection or a database as a stream without an end. The stream closes when the reader stops or the call aborts. A change stream needs a replica set. The type `BulkOperation` also has `BulkUpdateMany` and `BulkDeleteMany`.
- 89d8a4a: Three procedures only read now (CAP-1, CAP-2, CAP-3, roadmap R7), so a read-only session (`mark mcp --read-only`) serves them. `db.query` refuses a statement that changes data (`PRAGMA query_only`), and the file keeps its bytes. `mongo.documents.aggregate` refuses `$out` and `$merge`, also in the pipelines of `$facet`, `$lookup` and `$unionWith`. `logs.query` gives no entries for a missing file or table, and does not make them.

### Patch Changes

- Updated dependencies [ddea529]
- Updated dependencies [b2a3e3a]
- Updated dependencies [a8c47f1]
- Updated dependencies [381ce3a]
- Updated dependencies [0c627f8]
- Updated dependencies [ae7f05f]
- Updated dependencies [7873940]
- Updated dependencies [a70d445]
- Updated dependencies [bc70357]
- Updated dependencies [07cc998]
- Updated dependencies [a6b01a9]
- Updated dependencies [c799cdd]
- Updated dependencies [540f8d9]
- Updated dependencies [b6daaec]
- Updated dependencies [5b9264e]
- Updated dependencies [956e88b]
- Updated dependencies [ff62281]
- Updated dependencies [d81d0ed]
- Updated dependencies [aa67cc7]
- Updated dependencies [061fa22]
- Updated dependencies [cfb9d69]
- Updated dependencies [43f7de5]
- Updated dependencies [b07bb50]
- Updated dependencies [4a3bfa1]
- Updated dependencies [bd0b626]
- Updated dependencies [a6be873]
- Updated dependencies [fb30718]
- Updated dependencies [c5528e4]
- Updated dependencies [fee5d9c]
- Updated dependencies [21f7743]
- Updated dependencies [31a0b46]
  - @procedures/client@0.3.0
  - @procedures/collections@0.3.0

## 0.2.3

### Patch Changes

- Updated dependencies [15e48cf]
  - @procedures/client@0.2.3
  - @procedures/collections@0.2.3

## 0.2.2

### Patch Changes

- Updated dependencies [370b51a]
  - @procedures/client@0.2.2
  - @procedures/collections@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [a9dc8c8]
  - @procedures/client@0.2.1
  - @procedures/collections@0.2.1

## 0.2.0

### Minor Changes

- 76d0d64: **Breaking:** an import of a package registers nothing. The `./register` entry of a package registers its procedures, and the procedures of the modules that they need, in the global registry (ARCHITECTURE-PROPOSALS-2026-10, P9).
  
  - `import "@procedures/git"` gives the exports and registers nothing. Use `import "@procedures/git/register"`, or give `gitModule` (`@procedures/git/module`) to `createRegistry()`.
  - `import "@procedures/client/register"` registers the control flow (`client.chain` and the others) and `procedure.define`/`get`/`list`/`delete`. `createRegistry()` adds them to each new registry, as before. The new `registerClientProcedures(registry?)` does the same for any registry.
  - Each `register<Name>Procedures(registry?)` function is in the module of its package, takes a registry (the global one by default) and registers the modules that the package requires. `registerBridge` (splay) and `register` (store) are now `registerSplayProcedures` and `registerStoreProcedures`. The old names stay for one version.
  - `sideEffects` names only `./dist/register.js`, so a bundler can drop the rest of a package.
  - The bundles require `clientModule`, so `@procedures/bundle-mcp/register` gives the whole tool surface.
  - `lib new` makes `src/module.ts` and a root without side effects, and `procedure new` adds procedures to the module.

### Patch Changes

- Updated dependencies [0cf4bea]
- Updated dependencies [44d3e30]
- Updated dependencies [76d0d64]
  - @procedures/client@0.2.0
  - @procedures/collections@0.2.0

## 0.1.0

The first release on npm. The packages of the client monorepo have one version together.
