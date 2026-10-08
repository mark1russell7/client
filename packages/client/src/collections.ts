/**
 * Collections entry point: "@mark1russell7/client/collections"
 *
 * Re-exports @mark1russell7/client-collections, plus the collection storage
 * backends that need a Client and therefore live in this package.
 */

export * from "@mark1russell7/client-collections";

export { ApiStorage } from "./procedures/storage/api.js";
export type { ApiStorageOptions } from "./procedures/storage/api.js";
export { HybridStorage } from "./procedures/storage/hybrid.js";
export type { HybridStorageOptions, ConflictResolution, WriteStrategy } from "./procedures/storage/hybrid.js";
