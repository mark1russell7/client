/**
 * @mark1russell7/client-store: the program store of the client ecosystem.
 *
 * - The storage layer: the collection storages that need a Client (`ApiStorage`,
 *   `HybridStorage`), the synced registry and the dynamic handler loader. They moved here from
 *   `@mark1russell7/client` (roadmap 3.2).
 * - The procedures `procedure.store`, `load`, `sync`, `remote` and `register`.
 *
 * Importing the package registers its procedures.
 */

export * from "./storage/index.js";
export * from "./register.js";
export * from "./types.js";
