/**
 * Universal Cache Middleware
 *
 * Protocol-agnostic caching with LRU eviction and TTL expiration.
 * Works with any transport!
 */
import type { ResponseItem, Method, TypedClientMiddleware } from "../types";
import type { CacheContext } from "./contexts";
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