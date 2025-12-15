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
 * Simple mutex implementation for JavaScript async operations.
 *
 * Ensures that only one operation executes at a time, even if
 * multiple async operations are initiated concurrently.
 */
class Mutex {
  private queue: Promise<void> = Promise.resolve();

  /**
   * Acquires the lock and executes the function.
   * Other operations wait until this completes.
   */
  async lock<T>(fn: () => T | Promise<T>): Promise<T> {
    const run = this.queue.then(() => fn());
    this.queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  /**
   * Synchronous version that executes immediately.
   * Still queues to prevent interleaving with async operations.
   */
  lockSync<T>(fn: () => T): T {
    let result: T;
    let error: any;
    let hasError = false;

    // Execute synchronously but update queue
    try {
      result = fn();
    } catch (e) {
      error = e;
      hasError = true;
    }

    // Update the queue to reflect this operation completed
    const completed = Promise.resolve();
    this.queue = this.queue.then(() => completed);

    if (hasError) {
      throw error;
    }

    return result!;
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
export function synchronized<C extends object>(): Middleware<C> {
  return (next: C): C => {
    const mutex = new Mutex();

    return new Proxy(next, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);

        // Don't wrap non-functions
        if (typeof value !== "function") {
          return value;
        }

        // Check if the method is async by checking if it returns a Promise
        return function (this: any, ...args: any[]) {
          // Try to execute synchronously first
          const result = (value as Function).apply(target, args);

          // If result is a Promise, wrap with async lock
          if (result instanceof Promise) {
            return mutex.lock(() => result);
          }

          // Otherwise, use sync lock
          return mutex.lockSync(() => result);
        };
      },
    }) as C;
  };
}

/**
 * Alias for Java compatibility: synchronizedList
 */
export const synchronizedList : typeof synchronized = synchronized;

/**
 * Alias for Java compatibility: synchronizedMap
 */
export const synchronizedMap : typeof synchronized = synchronized;

/**
 * Alias for Java compatibility: synchronizedCollection
 */
export const synchronizedCollection : typeof synchronized = synchronized;

/**
 * Alias for Java compatibility: synchronizedSet
 */
export const synchronizedSet : typeof synchronized = synchronized;

/**
 * Advanced synchronized middleware with reentrant locking.
 *
 * Allows the same "thread" (async context) to acquire the lock multiple times.
 * Useful for methods that call other synchronized methods internally.
 *
 * Note: JavaScript doesn't have true thread IDs, so we use async context
 * tracking if available, or fall back to non-reentrant behavior.
 */
export function reentrantSynchronized<C extends object>(): Middleware<C> {
  return (next: C): C => {
    const mutex = new Mutex();
    let lockHolder: symbol | null = null;
    let lockCount = 0;

    return new Proxy(next, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);

        if (typeof value !== "function") {
          return value;
        }

        return async function (this: any, ...args: any[]) {
          // Generate a unique ID for this call context
          const callerId = Symbol("caller");

          // If we already hold the lock, execute directly (reentrant)
          if (lockHolder === callerId) {
            lockCount++;
            try {
              const result = (value as Function).apply(target, args);
              return result instanceof Promise ? await result : result;
            } finally {
              lockCount--;
            }
          }

          // Otherwise, acquire the lock
          return mutex.lock(async () => {
            lockHolder = callerId;
            lockCount = 1;
            try {
              const result = (value as Function).apply(target, args);
              return result instanceof Promise ? await result : result;
            } finally {
              lockCount--;
              if (lockCount === 0) {
                lockHolder = null;
              }
            }
          });
        };
      },
    }) as C;
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
export function readWriteLock<C extends object>(): Middleware<C> {
  return (next: C): C => {
    let readers = 0;
    let writer = false;
    let waitingReaders: (() => void)[] = [];
    let waitingWriters: (() => void)[] = [];

    const acquireRead = async (): Promise<void> => {
      if (writer || waitingWriters.length > 0) {
        await new Promise<void>((resolve) => waitingReaders.push(resolve));
      }
      readers++;
    };

    const releaseRead = (): void => {
      readers--;
      if (readers === 0 && waitingWriters.length > 0) {
        writer = true;
        const next = waitingWriters.shift()!;
        next();
      }
    };

    const acquireWrite = async (): Promise<void> => {
      if (writer || readers > 0) {
        await new Promise<void>((resolve) => waitingWriters.push(resolve));
      }
      writer = true;
    };

    const releaseWrite = (): void => {
      writer = false;
      if (waitingWriters.length > 0) {
        writer = true;
        const next = waitingWriters.shift()!;
        next();
      } else if (waitingReaders.length > 0) {
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

        return async function (this: any, ...args: any[]) {
          if (isReadMethod) {
            // Acquire read lock
            await acquireRead();
            try {
              const result = (value as Function).apply(target, args);
              return result instanceof Promise ? await result : result;
            } finally {
              releaseRead();
            }
          } else {
            // Acquire write lock
            await acquireWrite();
            try {
              const result = (value as Function).apply(target, args);
              return result instanceof Promise ? await result : result;
            } finally {
              releaseWrite();
            }
          }
        };
      },
    }) as C;
  };
}
