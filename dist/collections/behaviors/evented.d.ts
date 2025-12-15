/**
 * Evented behavior - Emits typed events on collection mutations.
 *
 * Wraps collections to emit events whenever elements are added, removed,
 * or the collection is cleared. Enables reactive programming patterns.
 *
 * @example
 * const list = compose(
 *   eventedList()
 * )(arrayList<number>())
 *
 * list.on('add', ({ value, index }) => {
 *   console.log(`Added ${value} at index ${index}`)
 * })
 *
 * list.add(42) // Triggers 'add' event
 */
import type { Middleware } from "../core/middleware.js";
import type { List } from "../interfaces/list.js";
import type { Queue, Deque } from "../interfaces/queue.js";
import type { MapLike } from "../interfaces/map.js";
import type { Collection } from "../interfaces/collection.js";
import { type Unsubscribe } from "../core/events.js";
/**
 * Events emitted by List collections.
 */
export interface ListEvents<T> {
    /** Element was added */
    add: {
        value: T;
        index?: number;
    };
    /** Element was removed */
    remove: {
        value: T;
        index?: number;
    };
    /** Element was replaced */
    set: {
        oldValue: T;
        newValue: T;
        index: number;
    };
    /** Collection was cleared */
    clear: {};
    /** Collection was sorted */
    sort: {};
    /** Collection was reversed */
    reverse: {};
}
/**
 * Events emitted by Queue collections.
 */
export interface QueueEvents<T> {
    /** Element was added to queue */
    enqueue: {
        value: T;
    };
    /** Element was removed from queue */
    dequeue: {
        value: T;
    };
    /** Collection was cleared */
    clear: {};
}
/**
 * Events emitted by Deque collections.
 */
export interface DequeEvents<T> {
    /** Element was added to front */
    addFirst: {
        value: T;
    };
    /** Element was added to back */
    addLast: {
        value: T;
    };
    /** Element was removed from front */
    removeFirst: {
        value: T;
    };
    /** Element was removed from back */
    removeLast: {
        value: T;
    };
    /** Collection was cleared */
    clear: {};
}
/**
 * Events emitted by Map collections.
 */
export interface MapEvents<K, V> {
    /** Key-value pair was set */
    set: {
        key: K;
        value: V;
        oldValue?: V;
    };
    /** Key was deleted */
    delete: {
        key: K;
        value: V;
    };
    /** Collection was cleared */
    clear: {};
}
/**
 * Generic collection events.
 */
export interface CollectionEvents<T> {
    /** Element was added */
    add: {
        value: T;
    };
    /** Element was removed */
    remove: {
        value: T;
    };
    /** Collection was cleared */
    clear: {};
}
/**
 * Creates an evented List middleware.
 *
 * Emits events for add, remove, set, clear, sort, and reverse operations.
 */
export declare function eventedList<T>(): Middleware<List<T>, List<T> & {
    on<E extends keyof ListEvents<T>>(event: E, listener: (payload: ListEvents<T>[E]) => void): Unsubscribe;
}>;
/**
 * Creates an evented Queue middleware.
 */
export declare function eventedQueue<T>(): Middleware<Queue<T>, Queue<T> & {
    on<E extends keyof QueueEvents<T>>(event: E, listener: (payload: QueueEvents<T>[E]) => void): Unsubscribe;
}>;
/**
 * Creates an evented Deque middleware.
 */
export declare function eventedDeque<T>(): Middleware<Deque<T>, Deque<T> & {
    on<E extends keyof DequeEvents<T>>(event: E, listener: (payload: DequeEvents<T>[E]) => void): Unsubscribe;
}>;
/**
 * Creates an evented Map middleware.
 */
export declare function eventedMap<K, V>(): Middleware<MapLike<K, V>, MapLike<K, V> & {
    on<E extends keyof MapEvents<K, V>>(event: E, listener: (payload: MapEvents<K, V>[E]) => void): Unsubscribe;
}>;
/**
 * Generic evented collection middleware.
 */
export declare function evented<T>(): Middleware<Collection<T>, Collection<T> & {
    on<E extends keyof CollectionEvents<T>>(event: E, listener: (payload: CollectionEvents<T>[E]) => void): Unsubscribe;
}>;
//# sourceMappingURL=evented.d.ts.map