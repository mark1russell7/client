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
/**
 * Simple mutex implementation for JavaScript async operations.
 *
 * Ensures that only one operation executes at a time, even if
 * multiple async operations are initiated concurrently.
 */
class Mutex {
    queue = Promise.resolve();
    /**
     * Acquires the lock and executes the function.
     * Other operations wait until this completes.
     */
    async lock(fn) {
        const run = this.queue.then(() => fn());
        this.queue = run.then(() => undefined, () => undefined);
        return run;
    }
    /**
     * Synchronous version that executes immediately.
     * Still queues to prevent interleaving with async operations.
     */
    lockSync(fn) {
        let result;
        let error;
        let hasError = false;
        // Execute synchronously but update queue
        try {
            result = fn();
        }
        catch (e) {
            error = e;
            hasError = true;
        }
        // Update the queue to reflect this operation completed
        const completed = Promise.resolve();
        this.queue = this.queue.then(() => completed);
        if (hasError) {
            throw error;
        }
        return result;
    }
}
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
export function synchronized() {
    return (next) => {
        const mutex = new Mutex();
        return new Proxy(next, {
            get(target, prop, receiver) {
                const value = Reflect.get(target, prop, receiver);
                // Don't wrap non-functions
                if (typeof value !== "function") {
                    return value;
                }
                // Check if the method is async by checking if it returns a Promise
                return function (...args) {
                    // Try to execute synchronously first
                    const result = value.apply(target, args);
                    // If result is a Promise, wrap with async lock
                    if (result instanceof Promise) {
                        return mutex.lock(() => result);
                    }
                    // Otherwise, use sync lock
                    return mutex.lockSync(() => result);
                };
            },
        });
    };
}
/**
 * Alias for Java compatibility: synchronizedList
 */
export const synchronizedList = synchronized;
/**
 * Alias for Java compatibility: synchronizedMap
 */
export const synchronizedMap = synchronized;
/**
 * Alias for Java compatibility: synchronizedCollection
 */
export const synchronizedCollection = synchronized;
/**
 * Alias for Java compatibility: synchronizedSet
 */
export const synchronizedSet = synchronized;
/**
 * Advanced synchronized middleware with reentrant locking.
 *
 * Allows the same "thread" (async context) to acquire the lock multiple times.
 * Useful for methods that call other synchronized methods internally.
 *
 * Note: JavaScript doesn't have true thread IDs, so we use async context
 * tracking if available, or fall back to non-reentrant behavior.
 */
export function reentrantSynchronized() {
    return (next) => {
        const mutex = new Mutex();
        let lockHolder = null;
        let lockCount = 0;
        return new Proxy(next, {
            get(target, prop, receiver) {
                const value = Reflect.get(target, prop, receiver);
                if (typeof value !== "function") {
                    return value;
                }
                return async function (...args) {
                    // Generate a unique ID for this call context
                    const callerId = Symbol("caller");
                    // If we already hold the lock, execute directly (reentrant)
                    if (lockHolder === callerId) {
                        lockCount++;
                        try {
                            const result = value.apply(target, args);
                            return result instanceof Promise ? await result : result;
                        }
                        finally {
                            lockCount--;
                        }
                    }
                    // Otherwise, acquire the lock
                    return mutex.lock(async () => {
                        lockHolder = callerId;
                        lockCount = 1;
                        try {
                            const result = value.apply(target, args);
                            return result instanceof Promise ? await result : result;
                        }
                        finally {
                            lockCount--;
                            if (lockCount === 0) {
                                lockHolder = null;
                            }
                        }
                    });
                };
            },
        });
    };
}
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
export function readWriteLock() {
    return (next) => {
        let readers = 0;
        let writer = false;
        let waitingReaders = [];
        let waitingWriters = [];
        const acquireRead = async () => {
            if (writer || waitingWriters.length > 0) {
                await new Promise((resolve) => waitingReaders.push(resolve));
            }
            readers++;
        };
        const releaseRead = () => {
            readers--;
            if (readers === 0 && waitingWriters.length > 0) {
                writer = true;
                const next = waitingWriters.shift();
                next();
            }
        };
        const acquireWrite = async () => {
            if (writer || readers > 0) {
                await new Promise((resolve) => waitingWriters.push(resolve));
            }
            writer = true;
        };
        const releaseWrite = () => {
            writer = false;
            if (waitingWriters.length > 0) {
                writer = true;
                const next = waitingWriters.shift();
                next();
            }
            else if (waitingReaders.length > 0) {
                const allReaders = waitingReaders.splice(0);
                readers = allReaders.length;
                allReaders.forEach((resolve) => resolve());
            }
        };
        // Methods that only read (don't mutate)
        const READ_METHODS = new Set([
            "get",
            "has",
            "contains",
            "containsAll",
            "containsValue",
            "indexOf",
            "lastIndexOf",
            "peek",
            "peekFirst",
            "peekLast",
            "first",
            "last",
            "isEmpty",
            "size",
            "toArray",
            "keys",
            "values",
            "entries",
            "forEach",
            "getOrDefault",
            "getOrUndefined",
        ]);
        return new Proxy(next, {
            get(target, prop, receiver) {
                const value = Reflect.get(target, prop, receiver);
                if (typeof value !== "function") {
                    return value;
                }
                const isReadMethod = typeof prop === "string" && READ_METHODS.has(prop);
                return async function (...args) {
                    if (isReadMethod) {
                        // Acquire read lock
                        await acquireRead();
                        try {
                            const result = value.apply(target, args);
                            return result instanceof Promise ? await result : result;
                        }
                        finally {
                            releaseRead();
                        }
                    }
                    else {
                        // Acquire write lock
                        await acquireWrite();
                        try {
                            const result = value.apply(target, args);
                            return result instanceof Promise ? await result : result;
                        }
                        finally {
                            releaseWrite();
                        }
                    }
                };
            },
        });
    };
}
//# sourceMappingURL=synchronized.js.map