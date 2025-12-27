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
    onExpire?: (info: {
        key: any;
        value: any;
        createdAt: number;
        expiredAt: number;
    }) => void;
}
/**
 * Creates a TTL Map middleware.
 *
 * Automatically removes entries after TTL expires.
 * Uses a background interval to check for expired entries.
 */
export declare function ttlMap<K, V>(options: TTLOptions): Middleware<MapLike<K, V> & {
    readonly dispose: () => void;
}>;
/**
 * Creates a TTL Collection middleware.
 *
 * Note: This is less precise than TTL map because collections don't have keys.
 * Elements are tracked by reference, which may not work for primitive types.
 */
export declare function ttlCollection<T>(options: Omit<TTLOptions, "onExpire"> & {
    onExpire?: (info: {
        element: T;
        createdAt: number;
        expiredAt: number;
    }) => void;
}): Middleware<Collection<T> & {
    readonly dispose: () => void;
}>;
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
export declare class TTLCache<K, V> {
    private readonly ttl;
    private readonly checkInterval;
    private readonly onExpire?;
    private map;
    private intervalId;
    constructor(ttl: number, checkInterval?: number, onExpire?: ((key: K, value: V) => void) | undefined);
    get size(): number;
    get(key: K): V | undefined;
    set(key: K, value: V, customTTL?: number): void;
    has(key: K): boolean;
    delete(key: K): boolean;
    clear(): void;
    /**
     * Manually trigger cleanup of expired entries.
     */
    cleanup(): void;
    /**
     * Get remaining TTL for a key in milliseconds.
     * Returns undefined if key doesn't exist or is expired.
     */
    getTTL(key: K): number | undefined;
    /**
     * Update TTL for an existing key.
     */
    touch(key: K, customTTL?: number): boolean;
    private startExpirationCheck;
    /**
     * Stop the background expiration checker and clean up.
     */
    dispose(): void;
    keys(): IterableIterator<K>;
    values(): IterableIterator<V>;
    entries(): IterableIterator<[K, V]>;
}
/**
 * Factory function to create a TTL cache.
 */
export declare function ttlCache<K, V>(ttl: number, options?: {
    checkInterval?: number;
    onExpire?: (key: K, value: V) => void;
}): TTLCache<K, V>;
//# sourceMappingURL=ttl.d.ts.map