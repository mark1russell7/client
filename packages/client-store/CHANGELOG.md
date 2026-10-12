# @mark1russell7/client-store

## 0.1.0

The first release on npm. The packages of the client monorepo have one version together.

- The program store: `ProgramStore`, `MemoryProgramStore`, `FileProgramStore`, `CollectionProgramStore`, `attachProgramStore()`.
- `procedure.store`, `load` and `sync` work on the program store. A stored program loads back as a runtime-defined procedure.
- The storage layer moved here from `@mark1russell7/client`: `ApiStorage`, `HybridStorage`, the synced registry, the serialization, the dynamic handler loader and `procedure.register`.
