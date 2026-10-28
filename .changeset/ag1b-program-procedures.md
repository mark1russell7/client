---
"@procedures/store": patch
---

`@procedures/store` gets the procedures of the saved programs of a tenant, and versions for each program store (AG1-B). This change is additive. Thus it is a PATCH of the client group (decision D13).

- `StoredProgram` gets the optional fields `name`, `description` and `version`. `checkStoredProgram` accepts them. The store sets `version` on each `put`.
- `put(program, { expectedVersion })` and `delete(key, { expectedVersion })` are optimistic writes (decision D11). A conflict rejects with `VersionConflictError` and changes nothing. `null` expects no record.
- The four backends test the version. `MemoryProgramStore`, `FileProgramStore` and `IndexedDbProgramStore` keep a counter. `CollectionProgramStore` uses the precondition of its storage: give the storage `versionOf: storedProgramVersion`.
- A `ProgramStore` of another package that ignores the options keeps working, but it gives no conflict check.
- `createProgramProcedures({ partition, storeFor, namespace? })` gives `programs.save`, `get`, `list` and `remove` over a store of each partition. `createProgramModule` gives them as a module. An import registers nothing.
- The resolver of the host decides the partition of each call, and a `null` result refuses the call with `FORBIDDEN`, reason `partition-not-allowed`. One tenant does not read the programs of another tenant.
- The procedures declare their effects. A read-only capability permits `get` and `list`, and refuses `save` and `remove`.
