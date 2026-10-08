/**
 * LRU (Least Recently Used) eviction behavior.
 *
 * Tracks access times and automatically evicts the least recently used
 * elements when capacity is reached. Perfect for caching.
 *
 * @example
 * const cache = compose(
 *   lruMap({ capacity: 100 })
 * )(hashMap<string, Data>())
 *
 * cache.set('key1', data1) // Accessed
 * cache.get('key1')        // Accessed again (moves to front)
 * // When full, least recently accessed keys are evicted
 */
import type { Middleware } from "../core/middleware.js";
import type { MapLike } from "../interfaces/map.js";
/**
 * Options for LRU behavior.
 */
export interface LRUOptions {
    /**
     * Maximum capacity. When exceeded, least recently used items are evicted.
     */
    capacity: number;
    /**
     * Optional callback invoked when an item is evicted.
     */
    onEvict?: (info: {
        key: any;
        value: any;
        timestamp: number;
    }) => void;
}
/**
 * Creates an LRU Map middleware.
 *
 * Maintains a doubly-linked list to track access order.
 * Most recently accessed items are at the head.
 * When capacity is exceeded, items at the tail are evicted.
 */
export declare function lruMap<K, V>(options: LRUOptions): Middleware<MapLike<K, V> & {
    readonly isFull: boolean;
}>;
/**
 * Creates an LRU cache with a simpler API.
 * This is a standalone LRU cache implementation.
 *
 * @example
 * const cache = lruCache<string, Data>(100)
 * cache.set('key', value)
 * cache.get('key') // Moves to front
 */
export declare class LRUCache<K, V> {
    private readonly capacity;
    private readonly onEvict?;
    private map;
    private head;
    private tail;
    constructor(capacity: number, onEvict?: ((key: K, value: V) => void) | undefined);
    get size(): number;
    get isFull(): boolean;
    get(key: K): V | undefined;
    set(key: K, value: V): void;
    has(key: K): boolean;
    delete(key: K): boolean;
    clear(): void;
    private moveToHead;
    private removeNode;
    private evictLRU;
    /**
     * Returns keys in LRU order (most recent first).
     */
    keys(): IterableIterator<K>;
    /**
     * Returns entries in LRU order (most recent first).
     */
    entries(): IterableIterator<[K, V]>;
}
/**
 * Factory function to create an LRU cache.
 */
export declare function lruCache<K, V>(capacity: number, onEvict?: (key: K, value: V) => void): LRUCache<K, V>;
//# sourceMappingURL=lru.d.ts.map