# @mark1russell7/client

## 0.1.0

The first release on npm. The packages of the client monorepo have one version together.

### Breaking changes (from the versions on GitHub)

- `procedure.get` gives `{ found: false }` for a path that has no procedure. Before, it gave `null`. For a procedure, it gives `found: true` with the description.
- `procedure.list` lists the registry of the caller. It takes `namespace` and `includeMetadata`, and it marks the procedures of `procedure.define` with `runtime: true`.
- The core depends on no other package of the repository (roadmap 3.3, 3.2, 3.4):
  - The storage layer moved to `@mark1russell7/client-store`: `ApiStorage`, `HybridStorage`, the synced registry (`createSyncedRegistry`, `SyncedProcedureRegistry`), the serialization, `createDynamicHandlerLoader` and the procedures `procedure.store`, `load`, `sync`, `remote` and `register`. The core no longer registers them.
  - The entry point `@mark1russell7/client/collections` is gone. Import the data structures from `@mark1russell7/client-collections`, and `ApiStorage`/`HybridStorage` from `@mark1russell7/client-store`.
  - The procedure components moved to `@mark1russell7/client-splay`. The entry point `@mark1russell7/client/components` and the component exports of the root are gone.
  - The core declares `CollectionStorage` and `StorageMetadata` itself, with the shape of the interface of `client-collections`.
- New: `runtimeProgramOf(procedure)` gives the program of a procedure that `procedure.define` made. `isAsyncIterable` is exported.
