/**
 * Base collection interfaces that mirror Java Collections Framework.
 *
 * These form the root of the collection hierarchy and define the
 * fundamental operations common to all collections.
 */
import type { Eq } from "../core/traits.js";
/**
 * ReadonlyCollection<T> - The root interface for readonly collections.
 *
 * Mirrors java.util.Collection but without mutation operations.
 * All collections should extend this or a more specific readonly interface.
 */
export interface ReadonlyCollection<T> extends Iterable<T> {
    /**
     * Returns the number of elements in this collection.
     */
    readonly size: number;
    /**
     * Returns true if this collection contains no elements.
     */
    readonly isEmpty: boolean;
    /**
     * Returns true if this collection contains the specified element.
     * Uses the collection's equality function to compare elements.
     *
     * @param element The element to check for
     */
    contains(element: T): boolean;
    /**
     * Returns true if this collection contains all elements in the specified collection.
     *
     * @param other The collection whose elements to check for
     */
    containsAll(other: Iterable<T>): boolean;
    /**
     * Returns an array containing all elements in this collection.
     * The returned array is safe to modify (it's a copy).
     */
    toArray(): T[];
    /**
     * Performs the given action for each element.
     *
     * @param action The action to perform for each element
     */
    forEach(action: (element: T, index: number) => void): void;
    /**
     * Returns the equality function used by this collection.
     */
    readonly eq: Eq<T>;
}
/**
 * Collection<T> - The root interface for mutable collections.
 *
 * Mirrors java.util.Collection with mutation operations.
 * All mutable collections should extend this or a more specific interface.
 */
export interface Collection<T> extends ReadonlyCollection<T> {
    /**
     * Adds an element to this collection.
     *
     * Returns true if the collection was modified as a result of this call.
     * Some collections (like Set) may return false if the element already exists.
     *
     * @param element The element to add
     * @returns true if the collection changed
     * @throws Error if collection is full (bounded) and policy is 'throw'
     */
    add(element: T): boolean;
    /**
     * Adds all elements from the specified collection to this collection.
     *
     * @param other The collection whose elements to add
     * @returns true if the collection changed
     */
    addAll(other: Iterable<T>): boolean;
    /**
     * Removes a single instance of the specified element from this collection.
     *
     * Returns true if an element was removed as a result of this call.
     *
     * @param element The element to remove
     * @returns true if an element was removed
     */
    remove(element: T): boolean;
    /**
     * Removes all elements from this collection that are also in the specified collection.
     *
     * @param other The collection whose elements to remove
     * @returns true if the collection changed
     */
    removeAll(other: Iterable<T>): boolean;
    /**
     * Retains only the elements in this collection that are in the specified collection.
     * In other words, removes all elements not in the specified collection.
     *
     * @param other The collection of elements to retain
     * @returns true if the collection changed
     */
    retainAll(other: Iterable<T>): boolean;
    /**
     * Removes all elements from this collection.
     * The collection will be empty after this call returns.
     */
    clear(): void;
}
/**
 * Utility type to check if a collection is readonly.
 */
export type IsReadonly<C> = C extends ReadonlyCollection<any> ? C extends Collection<any> ? false : true : false;
/**
 * Extract element type from a collection.
 */
export type ElementOf<C> = C extends ReadonlyCollection<infer T> ? T : never;
/**
 * Make a collection readonly by removing mutation methods.
 */
export type Readonly<C extends Collection<any>> = C extends Collection<infer T> ? ReadonlyCollection<T> : never;
//# sourceMappingURL=collection.d.ts.map