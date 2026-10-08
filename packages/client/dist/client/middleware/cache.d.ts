/**
 * Universal Cache Middleware
 *
 * Protocol-agnostic caching with LRU eviction and TTL expiration.
 * Works with any transport!
 */
import type { ResponseItem, Method, TypedClientMiddleware } from "../types.js";
import type { CacheContext } from "./contexts.js";
/**
 * Cache middleware options.
 */
export interface CacheOptions {
    /**
     * Time-to-live for cache entries in milliseconds.
     * @default 60000 (1 minute)
     */
    ttl?: number;
    /**
     * Maximum number of cache entries (LRU eviction when exceeded).
     * @default 100
     */
    capacity?: number;
    /**
     * Optional callback for cache statistics.
     * Called periodically with hit/miss/eviction metrics.
     */
    onStats?: (stats: CacheStats) => void;
    /**
     * Interval in milliseconds for emitting cache statistics.
     * Only used if onStats is provided.
     * @default 60000 (1 minute)
     */
    statsInterval?: number;
    /**
     * Custom cache key generator.
     * Default: `{service}.{operation}:{JSON.stringify(payload)}`
     *
     * @param method - Method being called
     * @param payload - Request payload
     * @returns Cache key string
     */
    keyGenerator?: (method: Method, payload: unknown) => string;
    /**
     * Predicate to determine if a response should be cached.
     * Default: Only cache successful responses
     *
     * @param item - Response item
     * @returns true if response should be cached
     */
    shouldCache?: (item: ResponseItem<unknown>) => boolean;
}
/**
 * Cache performance statistics.
 */
export interface CacheStats {
    /** Number of cache hits */
    hits: number;
    /** Number of cache misses */
    misses: number;
    /** Current cache size */
    size: number;
    /** Number of entries evicted */
    evictions: number;
    /** Hit rate as a percentage (0-100) */
    hitRate: number;
}
/**
 * Deterministic stringify for cache keys: recursively sorts object keys at every depth, so
 * payloads that are structurally equal (regardless of key order) map to the same key, and
 * null / primitive / array payloads are handled without throwing.
 *
 * Replaces a prior `JSON.stringify(payload, Object.keys(payload).sort())` which misused the
 * array-replacer form of JSON.stringify: that filters keys at *every* depth (so `{filter:{a:1}}`
 * and `{filter:{b:2}}` collided to the same key and returned each other's cached response) and
 * threw `TypeError` on null/primitive payloads. See documentation/BUGS-2026-07.md (C1).
 */
export declare function stableStringify(value: unknown): string;
/**
 * Default cache key generator.
 */
export declare function defaultKeyGenerator(method: Method, payload: unknown): string;
/**
 * Create cache middleware with LRU eviction and TTL expiration.
 *
 * Uses the collections framework for automatic memory management:
 * - LRU eviction when capacity is reached
 * - Background TTL cleanup for expired entries
 * - Bounded memory usage
 *
 * Features:
 * - Protocol-agnostic: Works with HTTP, gRPC, WebSocket, local
 * - Automatic eviction: LRU + TTL composition
 * - Observable: Optional stats callback
 * - Customizable: Custom key generation and cache predicates
 *
 * @param options - Cache configuration options
 * @returns Middleware function
 *
 * @example
 * ```typescript
 * client.use(createCacheMiddleware({
 *   capacity: 100,
 *   ttl: 60000, // 1 minute
 *   onStats: (stats) => console.log(`Hit rate: ${stats.hitRate}%`)
 * }));
 * ```
 */
export declare function createCacheMiddleware(options?: CacheOptions): TypedClientMiddleware<CacheContext, {}>;
//# sourceMappingURL=cache.d.ts.map