/**
 * Collections - the map, cache and storage building blocks of the client ecosystem.
 *
 * Provides:
 * - Map interfaces (MapLike and friends) and a hash map implementation
 * - Composable map behaviors: LRU eviction and TTL expiry
 * - Middleware composition (compose, bundle)
 * - The collection storage abstraction (CollectionStorage) and an in-memory backend
 * - Pluggable equality/hashing (traits, defaults)
 *
 * The client cache middleware uses these to build an LRU + TTL map. The storage backends
 * that need an RPC Client (ApiStorage, HybridStorage) are in @mark1russell7/client and
 * exported from "@mark1russell7/client/collections".
 *
 * @example
 * // A hash map with LRU eviction and TTL expiry
 * import { compose, hashMap, lruMap, ttlMap } from "@mark1russell7/client-collections";
 *
 * const cache = compose(
 *   lruMap<string, number>({ capacity: 100 }),
 *   ttlMap<string, number>({ ttl: 60_000 }),
 * )(hashMap<string, number>());
 *
 * cache.set("a", 1);
 * cache.get("a"); // 1
 */

// ============================================================================
// Core types and utilities
// ============================================================================

export * from "./core/traits.js";
export * from "./core/middleware.js";

// ============================================================================
// Interfaces
// ============================================================================

export * from "./interfaces/collection.js";
export * from "./interfaces/map.js";

// ============================================================================
// Storage
// ============================================================================

export * from "./storage/index.js";

// ============================================================================
// Implementations and behaviors
// ============================================================================

export * from "./impl/hash-map.js";
export * from "./behaviors/lru.js";
export * from "./behaviors/ttl.js";

// ============================================================================
// Utilities
// ============================================================================

export * from "./utils/defaults.js";
