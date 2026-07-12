/**
 * Universal Cache Middleware
 *
 * Protocol-agnostic caching with LRU eviction and TTL expiration.
 * Works with any transport!
 */
import { compose, lruMap, ttlMap, hashMap } from "../../collections/index.js";
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
export function stableStringify(value) {
    if (typeof value === "bigint")
        return `${value}n`;
    if (value === null || typeof value !== "object") {
        // Primitives — and undefined/function/symbol (JSON.stringify → undefined): never throw.
        return JSON.stringify(value) ?? String(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(",")}]`;
    }
    const obj = value;
    const body = Object.keys(obj)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
        .join(",");
    return `{${body}}`;
}
/**
 * Default cache key generator.
 */
export function defaultKeyGenerator(method, payload) {
    const methodKey = method.version
        ? `${method.version}:${method.service}.${method.operation}`
        : `${method.service}.${method.operation}`;
    return `${methodKey}:${stableStringify(payload)}`;
}
/**
 * Default should cache predicate - only cache successful responses.
 */
function defaultShouldCache(item) {
    return item.status.type === "success";
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
export function createCacheMiddleware(options = {}) {
    const { ttl = 60000, capacity = 100, onStats, statsInterval = 60000, keyGenerator = defaultKeyGenerator, shouldCache = defaultShouldCache, } = options;
    // Create cache using collections framework with LRU + TTL composition
    // This provides automatic eviction and expiration
    const cache = compose(lruMap({
        capacity,
        onEvict: () => {
            stats.evictions++;
        },
    }), ttlMap({
        ttl,
        checkInterval: Math.min(ttl, 30000), // Check every 30s or TTL, whichever is shorter
    }))(hashMap());
    // Track cache statistics
    const stats = {
        hits: 0,
        misses: 0,
        evictions: 0,
    };
    // Emit stats periodically if callback provided
    if (onStats) {
        const statsTimer = setInterval(() => {
            const total = stats.hits + stats.misses;
            const hitRate = total > 0 ? (stats.hits / total) * 100 : 0;
            onStats({
                hits: stats.hits,
                misses: stats.misses,
                size: cache.size,
                evictions: stats.evictions,
                hitRate: Math.round(hitRate * 100) / 100, // Round to 2 decimal places
            });
        }, statsInterval);
        // Unref so the stats timer never keeps the process alive on its own (its lifecycle is tied
        // to the client, not the event loop). See documentation/BUGS-2026-07.md (M4).
        statsTimer.unref?.();
    }
    return (next) => {
        return async function* (context) {
            // Generate cache key
            const cacheKey = keyGenerator(context.message.method, context.message.payload);
            // Check cache - use has() to avoid throwing "Key not found" error
            if (cache.has(cacheKey)) {
                const cached = cache.get(cacheKey);
                if (cached) {
                    // Cache hit - yield cached items
                    stats.hits++;
                    for (const item of cached) {
                        yield item;
                    }
                    return;
                }
            }
            // Cache miss - fetch and store
            stats.misses++;
            const items = [];
            const responseStream = next(context);
            for await (const item of responseStream) {
                items.push(item);
                yield item;
            }
            // Store in cache if all items are cacheable
            const allCacheable = items.every((item) => shouldCache(item));
            if (allCacheable && items.length > 0) {
                cache.set(cacheKey, items);
            }
        };
    };
}
//# sourceMappingURL=cache.js.map