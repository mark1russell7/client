/**
 * @procedures/store: the program store of the client ecosystem (roadmap 3.2).
 *
 * - The program store: `ProgramStore` and its backends (`MemoryProgramStore`,
 *   `FileProgramStore`, `CollectionProgramStore`), and the procedures `procedure.store`, `load`,
 *   `sync` and `remote`. A stored program loads back as a runtime-defined procedure.
 * - The storage layer that moved here from `@procedures/client`: the collection storages that
 *   need a Client (`ApiStorage`, `HybridStorage`), the synced registry, the serialization, the
 *   dynamic handler loader (an allowlist) and `procedure.register`.
 *
 * Importing the package registers its procedures.
 */

export * from "./storage/index.js";
export * from "./program-store/index.js";
export { ProcedureStoreError, type ProcedureStoreErrorCode } from "./errors.js";
export { procedureStorageModule, procedureStorageProcedures } from "./procedures.js";
export * from "./module.js";
export * from "./types.js";
