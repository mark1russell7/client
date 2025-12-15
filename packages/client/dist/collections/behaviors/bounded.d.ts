/**
 * Bounded behavior - Enforces capacity limits on collections.
 *
 * Wraps collections to prevent them from exceeding a maximum size.
 * Provides various overflow policies to handle full collections.
 *
 * @example
 * const list = compose(
 *   boundedList({ capacity: 100, policy: 'drop-oldest' })
 * )(arrayList<number>())
 *
 * // Add 101 elements - first element will be dropped
 * for (let i = 0; i < 101; i++) {
 *   list.add(i)
 * }
 */
import type { Middleware } from "../core/middleware.js";
import type { List } from "../interfaces/list.js";
import type { Queue, Deque } from "../interfaces/queue.js";
import type { MapLike } from "../interfaces/map.js";
import type { Collection } from "../interfaces/collection.js";
import type { OverflowPolicy, OverflowHandler, OverflowContext } from "../core/policies.js";
/**
 * Options for bounded behavior.
 */
export interface BoundedOptions<T> {
    /**
     * Maximum number of elements the collection can hold.
     */
    capacity: number;
    /**
     * Policy for handling overflow when collection is full.
     * @default 'throw'
     */
    policy?: OverflowPolicy;
    /**
     * Optional callback invoked when overflow occurs.
     * Called before the policy is applied.
     */
    onOverflow?: OverflowHandler<T>;
}
/**
 * Marker interface for bounded collections.
 */
export interface BoundedCollection {
    readonly capacity: number;
    readonly isFull: boolean;
    readonly remainingCapacity: number;
}
/**
 * Creates a bounded List middleware.
 *
 * Intercepts add operations to enforce capacity limits.
 * Supports multiple overflow policies.
 */
export declare function boundedList<T>(options: BoundedOptions<T>): Middleware<List<T>, List<T> & BoundedCollection>;
/**
 * Creates a bounded Queue middleware.
 */
export declare function boundedQueue<T>(options: BoundedOptions<T>): Middleware<Queue<T>, Queue<T> & BoundedCollection>;
/**
 * Creates a bounded Deque middleware.
 */
export declare function boundedDeque<T>(options: BoundedOptions<T>): Middleware<Deque<T>, Deque<T> & BoundedCollection>;
/**
 * Creates a bounded Map middleware.
 */
export declare function boundedMap<K, V>(options: Omit<BoundedOptions<V>, "onOverflow"> & {
    onOverflow?: (context: Omit<OverflowContext<V>, "newElement"> & {
        key: K;
        value: V;
    }) => void;
}): Middleware<MapLike<K, V>, MapLike<K, V> & BoundedCollection>;
/**
 * Generic bounded collection middleware.
 * Works with any collection type.
 */
export declare function bounded<C extends Collection<any>>(options: BoundedOptions<any>): Middleware<C, C & BoundedCollection>;
//# sourceMappingURL=bounded.d.ts.map