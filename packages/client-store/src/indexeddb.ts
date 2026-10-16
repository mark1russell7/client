/**
 * The entry `@procedures/store/indexeddb`: the stores of a browser (roadmap R45).
 *
 * - `IndexedDbProgramStore` keeps programs in IndexedDB.
 * - `IndexedDbQueueStore` keeps the queue of a `HybridStorage` in IndexedDB.
 * - `MemoryProgramStore` and `MemoryQueueStore` are the fallbacks for a browser without
 *   IndexedDB. `hasIndexedDb()` tells which one to use.
 *
 * The package root does not import this entry, and this entry does not import the client or zod:
 * a page that loads it gets only these stores.
 */

export { IndexedDbProgramStore, DEFAULT_PROGRAM_DATABASE } from "./indexeddb/program-store.js";
export { IndexedDbQueueStore } from "./indexeddb/queue-store.js";
export { hasIndexedDb, type IdbFactoryLike, type IndexedDbOptions } from "./indexeddb/idb.js";
export { MemoryProgramStore } from "./program-store/memory.js";
export { MemoryQueueStore } from "./storage/queue.js";
export type { ProgramStore, StoredProgram } from "./program-store/types.js";
export type { QueuedOperation, QueueStore } from "./storage/queue.js";
