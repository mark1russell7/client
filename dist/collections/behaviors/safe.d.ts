/**
 * Safe behavior - Provides Option/Result-based error handling.
 *
 * Wraps collection operations that throw errors to instead return
 * Option<T> or Result<T, E>, enabling functional error handling.
 *
 * @example
 * const list = compose(
 *   safeList()
 * )(arrayList<number>())
 *
 * const value = list.safe.get(10) // Option<number> instead of throwing
 * if (isSome(value)) {
 *   console.log(value.value)
 * }
 */
import type { Middleware } from "../core/middleware.js";
import type { List } from "../interfaces/list.js";
import type { Queue, Deque } from "../interfaces/queue.js";
import type { MapLike } from "../interfaces/map.js";
import { type Option, type Result } from "../core/effects.js";
/**
 * Safe operations for List.
 */
export interface SafeListOperations<T> {
    /**
     * Get element at index, returning Option.
     */
    get(index: number): Option<T>;
    /**
     * Set element at index, returning Result with old value or error.
     */
    set(index: number, element: T): Result<T, string>;
    /**
     * Remove element at index, returning Result with removed value or error.
     */
    removeAt(index: number): Result<T, string>;
    /**
     * Get first element as Option.
     */
    first(): Option<T>;
    /**
     * Get last element as Option.
     */
    last(): Option<T>;
    /**
     * Pop element, returning Option.
     */
    pop(): Option<T>;
    /**
     * Shift element, returning Option.
     */
    shift(): Option<T>;
}
/**
 * Safe operations for Queue.
 */
export interface SafeQueueOperations<T> {
    /**
     * Peek at head element as Option.
     */
    peek(): Option<T>;
    /**
     * Poll element as Option.
     */
    poll(): Option<T>;
    /**
     * Dequeue element as Option.
     */
    dequeue(): Option<T>;
}
/**
 * Safe operations for Deque.
 */
export interface SafeDequeOperations<T> extends SafeQueueOperations<T> {
    /**
     * Peek at first element as Option.
     */
    peekFirst(): Option<T>;
    /**
     * Peek at last element as Option.
     */
    peekLast(): Option<T>;
    /**
     * Poll first element as Option.
     */
    pollFirst(): Option<T>;
    /**
     * Poll last element as Option.
     */
    pollLast(): Option<T>;
    /**
     * Pop element as Option.
     */
    pop(): Option<T>;
}
/**
 * Safe operations for Map.
 */
export interface SafeMapOperations<K, V> {
    /**
     * Get value for key as Option.
     */
    get(key: K): Option<V>;
    /**
     * Set value for key, returning Result with old value or success.
     */
    set(key: K, value: V): Result<V | undefined, string>;
    /**
     * Delete key, returning Result with deleted value or error.
     */
    delete(key: K): Result<V | undefined, string>;
}
/**
 * Creates a safe List middleware.
 *
 * Exposes a `safe` property with Option/Result-based operations.
 */
export declare function safeList<T>(): Middleware<List<T> & {
    safe: SafeListOperations<T>;
}>;
/**
 * Creates a safe Queue middleware.
 */
export declare function safeQueue<T>(): Middleware<Queue<T> & {
    safe: SafeQueueOperations<T>;
}>;
/**
 * Creates a safe Deque middleware.
 */
export declare function safeDeque<T>(): Middleware<Deque<T> & {
    safe: SafeDequeOperations<T>;
}>;
/**
 * Creates a safe Map middleware.
 */
export declare function safeMap<K, V>(): Middleware<MapLike<K, V> & {
    safe: SafeMapOperations<K, V>;
}>;
/**
 * Helper to match on Result type.
 * Note: The match method is already built into Ok and Err constructors
 * in effects.ts, so no runtime augmentation is needed.
 */
declare module "../core/effects.js" {
    interface Ok<T> {
        match<U>(cases: {
            Ok: (value: T) => U;
            Err: (error: never) => U;
        }): U;
    }
    interface Err<E> {
        match<U>(cases: {
            Ok: (value: never) => U;
            Err: (error: E) => U;
        }): U;
    }
}
/**
 * Generic safe middleware that works with any collection.
 */
export declare function safe<C extends object>(): Middleware<C>;
//# sourceMappingURL=safe.d.ts.map