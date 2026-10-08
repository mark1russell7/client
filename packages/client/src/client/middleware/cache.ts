/**
 * Universal Cache Middleware
 *
 * Protocol-agnostic caching with LRU eviction and TTL expiration.
 * Works with any transport!
 */

import type { ClientRunner, ClientContext, ResponseItem, Method, TypedClientMiddleware } from "../types.js";
import type { CacheContext } from "./contexts.js";
import { compose, lruMap, ttlMap, hashMap } from "../../collections/index.js";
import type { MapLike } from "../../collections/interfaces/map.js";

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
export function stableStringify(value: unknown): string {
  if (typeof value === "bigint") return `${value}n`;
  if (value === null || typeof value !== "object") {
    // Primitives — and undefined/function/symbol (JSON.stringify → undefined): never throw.
    return JSON.stringify(value) ?? String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const body = Object.keys(obj)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
    .join(",");
  return `{${body}}`;
}

/**
 * Default cache key generator.
 */
export function defaultKeyGenerator(method: Method, payload: unknown): string {
  const methodKey = method.version
    ? `${method.version}:${method.service}.${method.operation}`
    : `${method.service}.${method.operation}`;

  return `${methodKey}:${stableStringify(payload)}`;
}

/**
 * Default should cache predicate - only cache successful responses.
 */
function defaultShouldCache(item: ResponseItem<unknown>): boolean {
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
export function createCacheMiddleware(options: CacheOptions = {}): TypedClientMiddleware<CacheContext, {}> {
  const {
    ttl = 60000,
    capacity = 100,
    onStats,
    statsInterval = 60000,
    keyGenerator = defaultKeyGenerator,
    shouldCache = defaultShouldCache,
  } = options;

  // Create cache using collections framework with LRU + TTL composition
  // This provides automatic eviction and expiration
  const cache: MapLike<string, ResponseItem<unknown>[]> = compose(
    lruMap({
      capacity,
      onEvict: () => {
        stats.evictions++;
      },
    }),
    ttlMap({
      ttl,
      checkInterval: Math.min(ttl, 30000), // Check every 30s or TTL, whichever is shorter
    }),
  )(hashMap<string, ResponseItem<unknown>[]>());

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

  return <TReq, TRes>(next: ClientRunner<TReq, TRes>): ClientRunner<TReq, TRes> => {
    return async function* (context: ClientContext<TReq>) {
      // Generate cache key
      const cacheKey = keyGenerator(context.message.method, context.message.payload);

      // Check cache - use has() to avoid throwing "Key not found" error
      if (cache.has(cacheKey)) {
        const cached = cache.get(cacheKey);
        if (cached) {
          // Cache hit - yield cached items
          stats.hits++;
          for (const item of cached) {
            yield item as ResponseItem<TRes>;
          }
          return;
        }
      }

      // Cache miss - fetch and store
      stats.misses++;
      const items: ResponseItem<TRes>[] = [];

      const responseStream = next(context);
      for await (const item of responseStream) {
        items.push(item);
        yield item;
      }

      // Store in cache if all items are cacheable
      const allCacheable = items.every((item) => shouldCache(item));
      if (allCacheable && items.length > 0) {
        cache.set(cacheKey, items as ResponseItem<unknown>[]);
      }
    };
  };
}
