/**
 * TTL (Time-To-Live) expiration behavior.
 *
 * Automatically expires elements after a specified time period.
 * Perfect for temporary caches and time-limited data.
 *
 * @example
 * const cache = compose(
 *   ttlMap({ ttl: 60000 }) // 60 seconds
 * )(hashMap<string, Data>())
 *
 * cache.set('key', data)
 * // After 60 seconds, 'key' is automatically removed
 */

import type { Middleware } from "../core/middleware.js";
import type { MapLike } from "../interfaces/map.js";
import type { Collection } from "../interfaces/collection.js";

/**
 * Options for TTL behavior.
 */
export interface TTLOptions {
  /**
   * Time-to-live in milliseconds.
   * Elements expire after this duration.
   */
  ttl: number;

  /**
   * Interval for checking expired elements (in milliseconds).
   * @default 1000 (check every second)
   */
  checkInterval?: number;

  /**
   * Optional callback invoked when an element expires.
   */
  onExpire?: (info: { key: any; value: any; createdAt: number; expiredAt: number }) => void;
}

/**
 * Metadata for TTL tracking.
 */
interface TTLEntry<V> {
  value: V;
  expiresAt: number;
  createdAt: number;
}

/**
 * Creates a TTL Map middleware.
 *
 * Automatically removes entries after TTL expires.
 * Uses a background interval to check for expired entries.
 */
export function ttlMap<K, V>(
  options: TTLOptions
): Middleware<MapLike<K, V> & { readonly dispose: () => void }> {
  const { ttl, checkInterval = 1000, onExpire } = options;

  return (
    next: MapLike<K, V>
  ): MapLike<K, V> & { readonly dispose: () => void } => {
    const metadata = new Map<K, TTLEntry<V>>();
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const checkExpired = (): void => {
      const now = Date.now();
      const expired: K[] = [];

      for (const [key, entry] of metadata) {
        if (now >= entry.expiresAt) {
          expired.push(key);
        }
      }

      for (const key of expired) {
        const entry = metadata.get(key);
        if (entry) {
          next.delete(key);
          metadata.delete(key);

          if (onExpire) {
            onExpire({
              key,
              value: entry.value,
              createdAt: entry.createdAt,
              expiredAt: now,
            });
          }
        }
      }
    };

    // Start background expiration checker
    intervalId = setInterval(checkExpired, checkInterval);

    const dispose = (): void => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    return new Proxy(next, {
      get(target, prop, receiver) {
        // Add dispose method
        if (prop === "dispose") {
          return dispose;
        }

        const value = Reflect.get(target, prop, receiver);

        if (typeof value === "function") {
          switch (prop) {
            case "get":
              return function (key: K): V {
                // Check if expired before returning
                const entry = metadata.get(key);
                if (entry && Date.now() >= entry.expiresAt) {
                  target.delete(key);
                  metadata.delete(key);
                  throw new Error(`Key expired: ${key}`);
                }
                return (value as Function).call(target, key);
              };

            case "has":
              return function (key: K): boolean {
                // Check if expired
                const entry = metadata.get(key);
                if (entry && Date.now() >= entry.expiresAt) {
                  target.delete(key);
                  metadata.delete(key);
                  return false;
                }
                return (value as Function).call(target, key);
              };

            case "set":
              return function (key: K, val: V): V | undefined {
                const now = Date.now();
                const result = (value as Function).call(target, key, val);

                metadata.set(key, {
                  value: val,
                  expiresAt: now + ttl,
                  createdAt: now,
                });

                return result;
              };

            case "delete":
              return function (key: K): V | undefined {
                const result = (value as Function).call(target, key);
                metadata.delete(key);
                return result;
              };

            case "clear":
              return function (): void {
                (value as Function).call(target);
                metadata.clear();
              };
          }
        }

        return value;
      },
    }) as MapLike<K, V> & { readonly dispose: () => void };
  };
}

/**
 * Creates a TTL Collection middleware.
 *
 * Note: This is less precise than TTL map because collections don't have keys.
 * Elements are tracked by reference, which may not work for primitive types.
 */
export function ttlCollection<T>(
  options: Omit<TTLOptions, "onExpire"> & {
    onExpire?: (info: { element: T; createdAt: number; expiredAt: number }) => void;
  }
): Middleware<Collection<T> & { readonly dispose: () => void }> {
  const { ttl, checkInterval = 1000, onExpire } = options;

  return (
    next: Collection<T>
  ): Collection<T> & { readonly dispose: () => void } => {
    const metadata = new Map<T, { expiresAt: number; createdAt: number }>();
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const checkExpired = (): void => {
      const now = Date.now();
      const expired: T[] = [];

      for (const [element, entry] of metadata) {
        if (now >= entry.expiresAt) {
          expired.push(element);
        }
      }

      for (const element of expired) {
        const entry = metadata.get(element);
        if (entry) {
          next.remove(element);
          metadata.delete(element);

          if (onExpire) {
            onExpire({
              element,
              createdAt: entry.createdAt,
              expiredAt: now,
            });
          }
        }
      }
    };

    intervalId = setInterval(checkExpired, checkInterval);

    const dispose = (): void => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    return new Proxy(next, {
      get(target, prop, receiver) {
        if (prop === "dispose") {
          return dispose;
        }

        const value = Reflect.get(target, prop, receiver);

        if (typeof value === "function") {
          switch (prop) {
            case "add":
              return function (element: T): boolean {
                const result = (value as Function).call(target, element);
                if (result) {
                  const now = Date.now();
                  metadata.set(element, {
                    expiresAt: now + ttl,
                    createdAt: now,
                  });
                }
                return result;
              };

            case "remove":
              return function (element: T): boolean {
                const result = (value as Function).call(target, element);
                if (result) {
                  metadata.delete(element);
                }
                return result;
              };

            case "clear":
              return function (): void {
                (value as Function).call(target);
                metadata.clear();
              };
          }
        }

        return value;
      },
    }) as Collection<T> & { readonly dispose: () => void };
  };
}

/**
 * Standalone TTL cache with Map-like API.
 *
 * @example
 * const cache = new TTLCache<string, number>(60000) // 60 second TTL
 * cache.set('key', 42)
 * setTimeout(() => {
 *   cache.get('key') // undefined (expired)
 * }, 61000)
 */
export class TTLCache<K, V> {
  private map = new Map<K, TTLEntry<V>>();
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly ttl: number,
    private readonly checkInterval: number = 1000,
    private readonly onExpire?: (key: K, value: V) => void
  ) {
    this.startExpirationCheck();
  }

  get size(): number {
    this.cleanup();
    return this.map.size;
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;

    if (Date.now() >= entry.expiresAt) {
      this.map.delete(key);
      if (this.onExpire) {
        this.onExpire(key, entry.value);
      }
      return undefined;
    }

    return entry.value;
  }

  set(key: K, value: V, customTTL?: number): void {
    const now = Date.now();
    const ttlToUse = customTTL !== undefined ? customTTL : this.ttl;

    this.map.set(key, {
      value,
      expiresAt: now + ttlToUse,
      createdAt: now,
    });
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  /**
   * Manually trigger cleanup of expired entries.
   */
  cleanup(): void {
    const now = Date.now();
    const expired: K[] = [];

    for (const [key, entry] of this.map) {
      if (now >= entry.expiresAt) {
        expired.push(key);
      }
    }

    for (const key of expired) {
      const entry = this.map.get(key);
      if (entry) {
        this.map.delete(key);
        if (this.onExpire) {
          this.onExpire(key, entry.value);
        }
      }
    }
  }

  /**
   * Get remaining TTL for a key in milliseconds.
   * Returns undefined if key doesn't exist or is expired.
   */
  getTTL(key: K): number | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;

    const remaining = entry.expiresAt - Date.now();
    return remaining > 0 ? remaining : undefined;
  }

  /**
   * Update TTL for an existing key.
   */
  touch(key: K, customTTL?: number): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;

    if (Date.now() >= entry.expiresAt) {
      this.map.delete(key);
      return false;
    }

    const ttlToUse = customTTL !== undefined ? customTTL : this.ttl;
    entry.expiresAt = Date.now() + ttlToUse;
    return true;
  }

  private startExpirationCheck(): void {
    this.intervalId = setInterval(() => this.cleanup(), this.checkInterval);
  }

  /**
   * Stop the background expiration checker and clean up.
   */
  dispose(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  *keys(): IterableIterator<K> {
    this.cleanup();
    yield* this.map.keys();
  }

  *values(): IterableIterator<V> {
    this.cleanup();
    for (const entry of this.map.values()) {
      yield entry.value;
    }
  }

  *entries(): IterableIterator<[K, V]> {
    this.cleanup();
    for (const [key, entry] of this.map) {
      yield [key, entry.value];
    }
  }
}

/**
 * Factory function to create a TTL cache.
 */
export function ttlCache<K, V>(
  ttl: number,
  options?: {
    checkInterval?: number;
    onExpire?: (key: K, value: V) => void;
  }
): TTLCache<K, V> {
  return new TTLCache(
    ttl,
    options?.checkInterval,
    options?.onExpire
  );
}
