/**
 * Universal Cache Middleware
 *
 * Protocol-agnostic caching with LRU eviction and TTL expiration.
 * Works with any transport!
 */

import type { ClientRunner, ClientContext, ResponseItem, Metadata, Method, TypedClientMiddleware } from "../types.js";
import type { CacheContext } from "./contexts.js";
import { LruMap } from "./lru.js";
import { isDuration, optionalMs, type Duration } from "../../duration.js";
import type { Effects } from "../../procedures/types.js";
import { TIMER_DEFAULTS } from "../../timers.js";
import { methodName } from "../../server/method.js";
import { abortedItem } from "./items.js";

/**
 * Cache middleware options.
 */
export interface CacheOptions {
  /**
   * The methods whose responses the middleware caches: a list of `"service.operation"` names,
   * or a predicate. Caching is opt-in for each method: before, the middleware cached every
   * call, mutations too (deep dive TRN-5).
   */
  methods: readonly string[] | ((method: Method) => boolean);

  /**
   * Time-to-live for cache entries, for example `minutes(1)`. A call can give its own: `cache: { ttl }`.
   * @default 60000 (1 minute)
   */
  ttl?: Duration;

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
   * Interval for emitting cache statistics.
   * Only used if onStats is provided.
   * @default 60000 (1 minute)
   */
  statsInterval?: Duration;

  /**
   * Custom cache key generator.
   * Default: the method, the payload and the request metadata (see `defaultKeyGenerator`).
   *
   * @param method - Method being called
   * @param payload - Request payload
   * @param metadata - Request metadata (auth, pagination, custom fields)
   * @returns Cache key string
   */
  keyGenerator?: (method: Method, payload: unknown, metadata: Metadata) => string;

  /**
   * Predicate to determine if a response should be cached.
   * Default: Only cache successful responses
   *
   * @param item - Response item
   * @returns true if response should be cached
   */
  shouldCache?: (item: ResponseItem<unknown>) => boolean;

  /**
   * The effects of each method (roadmap R13), for example `effectsIn(registry)`. A call that
   * writes resources deletes the cached entries of the methods that read one of them, when it
   * succeeds. An entry of a method with unknown reads goes too. Without this option, a write
   * deletes nothing, and the entries live until their time to live ends.
   */
  effects?: (method: Method) => Effects | undefined;
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
 * The metadata keys that do not change a response: middleware state, tracing, and the keys of
 * one call (its idempotency key and the remaining time of its deadline). The other keys (auth,
 * pagination, custom fields) are part of the cache key.
 */
const VOLATILE_METADATA = new Set([
  "retry",
  "timeout",
  "tracing",
  "cache",
  "circuitBreaker",
  "rateLimit",
  "idempotency-key",
  "procedure-timeout",
  "traceparent",
]);

/** The part of the metadata that can change a response. */
function keyMetadata(metadata: Metadata): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (VOLATILE_METADATA.has(key) || key.startsWith("__") || value === undefined) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Default cache key generator: the method, the payload and the metadata that can change the
 * response. Before, the key ignored the metadata: with `withContext({ auth })`, one user got
 * the cached response of another user, and a pagination cursor in the metadata returned the
 * first page forever (deep dive TRN-5).
 */
export function defaultKeyGenerator(method: Method, payload: unknown, metadata?: Metadata): string {
  // The name of the codec: a path of one segment has the key of its operation, not ".operation" (CLI-28)
  const name = methodName(method);
  const methodKey = method.version ? `${method.version}:${name}` : name;

  const base = `${methodKey}:${stableStringify(payload)}`;
  return metadata ? `${base}|${stableStringify(keyMetadata(metadata))}` : base;
}

/** A deep copy of a cache entry, or undefined when the payload cannot be copied. */
function copyItem<T>(item: ResponseItem<T>): ResponseItem<T> | undefined {
  try {
    return structuredClone(item);
  } catch {
    return undefined;
  }
}

/** A stored response and the time at which it expires. */
interface CacheEntry {
  items: ResponseItem<unknown>[];
  expiresAt: number;
  /** The resources that the method of the entry reads, when the `effects` option knows them */
  reads: readonly string[] | undefined;
  /** The method of the entry, for the invalidation by method */
  method: Method;
}

/** The deleters of each cache middleware, for `invalidateCache` */
const invalidators = new WeakMap<object, (matches?: (method: Method) => boolean) => number>();

/**
 * This function deletes the entries of a cache middleware: all of them, or the entries of the
 * methods that `matches` selects. It gives the number of deleted entries.
 */
export function invalidateCache(middleware: object, matches?: (method: Method) => boolean): number {
  return invalidators.get(middleware)?.(matches) ?? 0;
}

/** The overrides of one call: `cache: { ttl, bypass, refresh }` in its context. */
function cacheOverrides(value: unknown): { ttl?: number; bypass?: boolean; refresh?: boolean } {
  if (typeof value !== "object" || value === null) return {};
  const { ttl, bypass, refresh } = value as Record<string, unknown>;
  return {
    ...(isDuration(ttl) && ttl.value >= 0 ? { ttl: optionalMs(ttl, "cache.ttl")! } : {}),
    ...(bypass === true ? { bypass: true } : {}),
    ...(refresh === true ? { refresh: true } : {}),
  };
}

/**
 * Default should cache predicate - only cache successful responses.
 */
/** The value of `untilAbort` when the signal aborts first. */
const ABORTED: unique symbol = Symbol("aborted");

/** The value of a promise, or `ABORTED` when the signal aborts first. Without a signal, the promise. */
function untilAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T | typeof ABORTED> {
  if (signal === undefined) return promise;
  if (signal.aborted) return Promise.resolve(ABORTED);
  return new Promise((resolve, reject) => {
    const onAbort = (): void => resolve(ABORTED);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function defaultShouldCache(item: ResponseItem<unknown>): boolean {
  return item.status.type === "success";
}

/**
 * Create cache middleware with LRU eviction and TTL expiration.
 *
 * Memory management:
 * - LRU eviction when capacity is reached (bounded memory, a small map of the core)
 * - Each entry has its own expiry time, so a call can give its own TTL
 *
 * Each call can give overrides in its context (`route()` overrides, or `withContext`):
 * `cache: { ttl }` for the entry that it stores, `cache: { bypass: true }` to skip the cache, and
 * `cache: { refresh: true }` to fetch and replace the stored response. After the call, the
 * context has `cache.hit` (CacheContext).
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
 *   methods: ["users.get", "users.list"], // only these calls are cached
 *   capacity: 100,
 *   ttl: minutes(1),
 *   onStats: (stats) => console.log(`Hit rate: ${stats.hitRate}%`)
 * }));
 * ```
 */
export function createCacheMiddleware(options: CacheOptions): TypedClientMiddleware<CacheContext, {}> {
  const ttl = optionalMs(options.ttl, "ttl") ?? TIMER_DEFAULTS.cache.ttlMs;
  const statsInterval = optionalMs(options.statsInterval, "statsInterval") ?? TIMER_DEFAULTS.cache.statsIntervalMs;
  const {
    methods,
    capacity = 100,
    onStats,
    keyGenerator = defaultKeyGenerator,
    shouldCache = defaultShouldCache,
  } = options;

  // An LRU map bounds the memory. Each entry keeps its own expiry time, so a call can give its
  // own TTL: before, one TTL map expired every entry after the TTL of the middleware.
  const cache = new LruMap<string, CacheEntry>(capacity, () => {
    stats.evictions++;
  });

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

  const cacheable =
    typeof methods === "function"
      ? methods
      : ((names: ReadonlySet<string>) => (method: Method): boolean => names.has(methodName(method)))(
          new Set(methods),
        );
  const effectsOf = options.effects;

  /**
   * The calls in flight, by key: a second call with the same key waits for the first one and
   * gets a copy of its response (roadmap R13). Before, each one made its own request.
   */
  const inFlight = new Map<string, Promise<CacheEntry | undefined>>();

  /** A write that succeeded deletes the entries that read one of its resources (R13). */
  const invalidateAfterWrite = (method: Method): void => {
    const writes = effectsOf?.(method)?.writes;
    if (!writes || writes.length === 0) return;
    cache.deleteWhere((entry) => entry.reads === undefined || entry.reads.some((resource) => writes.includes(resource)));
  };

  const middleware = <TReq, TRes>(next: ClientRunner<TReq, TRes>): ClientRunner<TReq, TRes> => {
    return async function* (context: ClientContext<TReq>) {
      if (!cacheable(context.message.method)) {
        let failed = false;
        for await (const item of next(context)) {
          if (item.status.type === "error") failed = true;
          yield item;
        }
        if (!failed && effectsOf) invalidateAfterWrite(context.message.method);
        return;
      }

      const metadata = context.message.metadata;
      const overrides = cacheOverrides(metadata["cache"]);
      // The state for the outer middlewares (CacheContext). The key is not written: it holds the
      // payload, and the metadata of a retry travels in a header.
      const setState = (hit: boolean): void => {
        metadata["cache"] = { ...overrides, hit };
      };

      if (overrides.bypass) {
        yield* next(context);
        setState(false);
        return;
      }

      // Generate cache key
      const cacheKey = keyGenerator(context.message.method, context.message.payload, metadata);

      // Check cache - use has() to avoid throwing "Key not found" error. A refresh skips the read.
      if (!overrides.refresh && cache.has(cacheKey)) {
        const cached = cache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
          // Cache hit - yield a copy: a caller that changes its result does not change the cache
          stats.hits++;
          setState(true);
          for (const item of cached.items) {
            yield (copyItem(item) ?? item) as ResponseItem<TRes>;
          }
          return;
        }
        // Expired
        cache.delete(cacheKey);
      }

      // The same call is in flight: wait for it and give a copy of its response (R13)
      const pending = overrides.refresh ? undefined : inFlight.get(cacheKey);
      if (pending) {
        // The wait follows the signal of this call: an abort ends it, also while the first call runs
        const shared = await untilAbort(pending, context.message.signal);
        if (shared === ABORTED) {
          yield abortedItem<TRes>(context.message.id);
          return;
        }
        if (shared) {
          stats.hits++;
          setState(true);
          for (const item of shared.items) yield (copyItem(item) ?? item) as ResponseItem<TRes>;
          return;
        }
        // The first call gave a stream or an error: this call makes its own request
      }

      // Cache miss - fetch and store. Only a response of one item is cached: a stream is never
      // collected or cached (before, the middleware kept every item of a stream in memory).
      stats.misses++;
      let first: ResponseItem<TRes> | undefined;
      let count = 0;
      let settle: (entry: CacheEntry | undefined) => void = () => undefined;
      const mine = new Promise<CacheEntry | undefined>((resolve) => (settle = resolve));
      if (!overrides.refresh) inFlight.set(cacheKey, mine);
      let entry: CacheEntry | undefined;
      try {
        for await (const item of next(context)) {
          count++;
          if (count === 1) first = item;
          yield item;
        }
        setState(false);

        // An inner layer that changed the key metadata during the call (an auth middleware
        // inside the cache) makes the key wrong: such a response is not stored (R13)
        const keyAfter = keyGenerator(context.message.method, context.message.payload, metadata);
        if (count === 1 && first && shouldCache(first) && keyAfter === cacheKey) {
          const copy = copyItem(first);
          if (copy) {
            entry = {
              items: [copy as ResponseItem<unknown>],
              expiresAt: Date.now() + (overrides.ttl ?? ttl),
              reads: effectsOf?.(context.message.method)?.reads,
              method: context.message.method,
            };
            cache.set(cacheKey, entry);
          }
        }
      } finally {
        if (inFlight.get(cacheKey) === mine) inFlight.delete(cacheKey);
        settle(entry);
      }
    };
  };
  invalidators.set(middleware, (matches) => {
    if (!matches) {
      const size = cache.size;
      cache.clear();
      return size;
    }
    return cache.deleteWhere((entry) => matches(entry.method));
  });
  return middleware;
}
