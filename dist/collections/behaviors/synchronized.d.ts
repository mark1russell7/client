/**
 * Synchronized behavior - Provides thread-safe access with mutex locking.
 *
 * Wraps collections to serialize all operations using a mutex, ensuring
 * thread-safe access in concurrent environments. Mirrors Java's
 * Collections.synchronizedList() and related methods.
 *
 * Note: JavaScript is single-threaded, but async operations can interleave.
 * This middleware ensures atomic operations across async boundaries.
 *
 * @example
 * const list = compose(
 *   synchronized()
 * )(arrayList<number>())
 *
 * // All operations are now serialized
 * await Promise.all([
 *   list.add(1),
 *   list.add(2),
 *   list.add(3)
 * ])
 */
import type { Middleware } from "../core/middleware.js";
/**
 * Creates a synchronized middleware that locks all method calls.
 *
 * Every method call on the collection is wrapped with a mutex,
 * ensuring atomic execution even in concurrent async scenarios.
 *
 * @example
 * const syncList = compose(
 *   synchronized()
 * )(arrayList<number>())
 *
 * // These additions are guaranteed to execute in order
 * await Promise.all([
 *   syncList.add(1),
 *   syncList.add(2),
 *   syncList.add(3)
 * ])
 */
export declare function synchronized<C extends object>(): Middleware<C>;
/**
 * Alias for Java compatibility: synchronizedList
 */
export declare const synchronizedList: typeof synchronized;
/**
 * Alias for Java compatibility: synchronizedMap
 */
export declare const synchronizedMap: typeof synchronized;
/**
 * Alias for Java compatibility: synchronizedCollection
 */
export declare const synchronizedCollection: typeof synchronized;
/**
 * Alias for Java compatibility: synchronizedSet
 */
export declare const synchronizedSet: typeof synchronized;
/**
 * Advanced synchronized middleware with reentrant locking.
 *
 * Allows the same "thread" (async context) to acquire the lock multiple times.
 * Useful for methods that call other synchronized methods internally.
 *
 * Note: JavaScript doesn't have true thread IDs, so we use async context
 * tracking if available, or fall back to non-reentrant behavior.
 */
export declare function reentrantSynchronized<C extends object>(): Middleware<C>;
/**
 * Read-write lock implementation for collections.
 *
 * Allows multiple concurrent readers but exclusive writers.
 * More efficient than full synchronization for read-heavy workloads.
 *
 * @example
 * const list = compose(
 *   readWriteLock()
 * )(arrayList<number>())
 *
 * // Multiple reads can happen concurrently
 * await Promise.all([
 *   list.get(0),
 *   list.get(1),
 *   list.get(2)
 * ])
 */
export declare function readWriteLock<C extends object>(): Middleware<C>;
//# sourceMappingURL=synchronized.d.ts.map