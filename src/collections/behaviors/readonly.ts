/**
 * Readonly behavior - Creates immutable views of collections.
 *
 * Wraps collections to prevent modifications by throwing errors
 * on any mutation attempt. Mirrors Java's Collections.unmodifiable*() methods.
 *
 * @example
 * const list = compose(
 *   readonlyList()
 * )(arrayList([1, 2, 3]))
 *
 * list.get(0) // OK: 1
 * list.add(4) // Error: Cannot modify readonly list
 */

import type { Middleware } from "../core/middleware.js";
import type { ReadonlyList } from "../interfaces/list.js";
import type { ReadonlyQueue } from "../interfaces/queue.js";
import type { ReadonlyMapLike } from "../interfaces/map.js";
import type { ReadonlyCollection } from "../interfaces/collection.js";

/**
 * Options for readonly behavior.
 */
export interface ReadonlyOptions {
  /**
   * Custom error message to throw on mutation attempts.
   * @default 'Cannot modify readonly collection'
   */
  errorMessage?: string;
}

/**
 * Set of method names that mutate collections.
 */
const MUTATING_METHODS = new Set([
  // Collection mutations
  "add",
  "addAll",
  "remove",
  "removeAll",
  "retainAll",
  "clear",

  // List mutations
  "set",
  "insert",
  "insertAll",
  "removeAt",
  "removeRange",
  "push",
  "pop",
  "shift",
  "unshift",
  "sort",
  "reverse",

  // Queue/Deque mutations
  "offer",
  "offerFirst",
  "offerLast",
  "poll",
  "pollFirst",
  "pollLast",
  "enqueue",
  "dequeue",
  "addFirst",
  "addLast",
  "removeFirst",
  "removeLast",

  // Map mutations
  "set",
  "delete",
  "deleteEntry",
  "replace",
  "replaceEntry",
  "computeIfAbsent",
  "computeIfPresent",
  "compute",
  "merge",
  "putAll",
]);

/**
 * Creates a readonly middleware for any collection type.
 */
function createReadonly<C extends object>(
  errorMessage: string = "Cannot modify readonly collection"
): Middleware<C> {
  return (next: C): C => {
    return new Proxy(next, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);

        // Block mutating methods
        if (typeof prop === "string" && MUTATING_METHODS.has(prop)) {
          if (typeof value === "function") {
            return () => {
              throw new Error(errorMessage);
            };
          }
        }

        // For functions that return sublists/submaps, wrap them too
        if (typeof value === "function" && (prop === "subList" || prop === "subMap")) {
          return function (this: any, ...args: any[]) {
            const result = value.apply(target, args);
            // Recursively apply readonly to the result
            return createReadonly<typeof result>(errorMessage)(result);
          };
        }

        return value;
      },

      set(_target, _prop, _value, _receiver) {
        // Block property assignments
        throw new Error(errorMessage);
      },

      deleteProperty(_target, _prop) {
        // Block property deletions
        throw new Error(errorMessage);
      },
    });
  };
}

/**
 * Creates a readonly List middleware.
 *
 * All mutation methods will throw an error.
 * Read operations work normally.
 *
 * @example
 * const readonlyNumbers = compose(
 *   readonlyList()
 * )(arrayList([1, 2, 3]))
 */
export function readonlyList<T>(
  options: ReadonlyOptions = {}
): Middleware<ReadonlyList<T>> {
  const errorMessage = options.errorMessage ?? "Cannot modify readonly list";
  return createReadonly<any>(errorMessage);
}

/**
 * Creates a readonly Queue middleware.
 */
export function readonlyQueue<T>(
  options: ReadonlyOptions = {}
): Middleware<ReadonlyQueue<T>> {
  const errorMessage = options.errorMessage ?? "Cannot modify readonly queue";
  return createReadonly<any>(errorMessage);
}

/**
 * Creates a readonly Map middleware.
 */
export function readonlyMap<K, V>(
  options: ReadonlyOptions = {}
): Middleware<ReadonlyMapLike<K, V>> {
  const errorMessage = options.errorMessage ?? "Cannot modify readonly map";
  return createReadonly<any>(errorMessage);
}

/**
 * Creates a readonly Collection middleware.
 *
 * Generic version that works with any collection type.
 */
export function readonlyCollection<T>(
  options: ReadonlyOptions = {}
): Middleware<ReadonlyCollection<T>> {
  const errorMessage = options.errorMessage ?? "Cannot modify readonly collection";
  return createReadonly<any>(errorMessage);
}

/**
 * Generic readonly middleware.
 * Alias for readonlyCollection.
 */
export function readonly<C extends object>(
  options: ReadonlyOptions = {}
): Middleware<C> {
  const errorMessage = options.errorMessage ?? "Cannot modify readonly collection";
  return createReadonly<C>(errorMessage);
}

/**
 * Alias for Java compatibility: unmodifiableList
 */
export const unmodifiableList : typeof readonlyList = readonlyList;

/**
 * Alias for Java compatibility: unmodifiableMap
 */
export const unmodifiableMap : typeof readonlyMap = readonlyMap;

/**
 * Alias for Java compatibility: unmodifiableCollection
 */
export const unmodifiableCollection : typeof readonlyCollection = readonlyCollection;
