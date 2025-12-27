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
export declare function readonlyList<T>(options?: ReadonlyOptions): Middleware<ReadonlyList<T>>;
/**
 * Creates a readonly Queue middleware.
 */
export declare function readonlyQueue<T>(options?: ReadonlyOptions): Middleware<ReadonlyQueue<T>>;
/**
 * Creates a readonly Map middleware.
 */
export declare function readonlyMap<K, V>(options?: ReadonlyOptions): Middleware<ReadonlyMapLike<K, V>>;
/**
 * Creates a readonly Collection middleware.
 *
 * Generic version that works with any collection type.
 */
export declare function readonlyCollection<T>(options?: ReadonlyOptions): Middleware<ReadonlyCollection<T>>;
/**
 * Generic readonly middleware.
 * Alias for readonlyCollection.
 */
export declare function readonly<C extends object>(options?: ReadonlyOptions): Middleware<C>;
/**
 * Alias for Java compatibility: unmodifiableList
 */
export declare const unmodifiableList: typeof readonlyList;
/**
 * Alias for Java compatibility: unmodifiableMap
 */
export declare const unmodifiableMap: typeof readonlyMap;
/**
 * Alias for Java compatibility: unmodifiableCollection
 */
export declare const unmodifiableCollection: typeof readonlyCollection;
//# sourceMappingURL=readonly.d.ts.map