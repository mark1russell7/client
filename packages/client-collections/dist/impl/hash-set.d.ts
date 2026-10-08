/**
 * HashSet implementation - A set backed by a HashMap.
 *
 * Provides O(1) average case for add, remove, and contains operations.
 * Elements are unique based on custom equality and hash functions.
 * Mirrors java.util.HashSet.
 *
 * @example
 * const set = hashSet<number>()
 * set.add(1)
 * set.add(2)
 * set.add(1) // Returns false, already present
 * set.size // 2
 */
import type { Set } from "../interfaces/set.js";
import type { Eq, Hash } from "../core/traits.js";
import { HashMap } from "./hash-map.js";
/**
 * Options for creating a HashSet.
 */
export interface HashSetOptions<T> {
    /**
     * Initial capacity.
     * @default 16
     */
    initialCapacity?: number;
    /**
     * Load factor threshold for resizing.
     * @default 0.75
     */
    loadFactor?: number;
    /**
     * Equality function for elements.
     * @default defaultEq (===)
     */
    eq?: Eq<T>;
    /**
     * Hash function for elements.
     * @default defaultHash
     */
    hash?: Hash<T>;
}
/**
 * HashSet<T> - Hash table implementation of the Set interface.
 *
 * Backed by a HashMap where values are a dummy constant.
 * Provides constant-time performance for basic operations.
 *
 * Not thread-safe. Use synchronized() behavior for concurrent access.
 */
export declare class HashSet<T> implements Set<T> {
    private readonly _map;
    private readonly _eq;
    constructor(options?: HashSetOptions<T>);
    get size(): number;
    get isEmpty(): boolean;
    get eq(): Eq<T>;
    add(element: T): boolean;
    remove(element: T): boolean;
    contains(element: T): boolean;
    addAll(other: Iterable<T>): boolean;
    removeAll(other: Iterable<T>): boolean;
    retainAll(other: Iterable<T>): boolean;
    containsAll(other: Iterable<T>): boolean;
    clear(): void;
    /**
     * Returns a new set that is the union of this set and the other set.
     * Contains all elements from both sets.
     */
    union(other: Iterable<T>): HashSet<T>;
    /**
     * Returns a new set that is the intersection of this set and the other set.
     * Contains only elements present in both sets.
     */
    intersection(other: Iterable<T>): HashSet<T>;
    /**
     * Returns a new set that is the difference of this set and the other set.
     * Contains elements in this set but not in the other set.
     */
    difference(other: Iterable<T>): HashSet<T>;
    /**
     * Returns a new set that is the symmetric difference of this set and the other set.
     * Contains elements in either set but not in both.
     */
    symmetricDifference(other: Iterable<T>): HashSet<T>;
    /**
     * Returns true if this set is a subset of the other set.
     * All elements in this set are also in the other set.
     */
    isSubsetOf(other: Iterable<T>): boolean;
    /**
     * Returns true if this set is a superset of the other set.
     * All elements in the other set are also in this set.
     */
    isSupersetOf(other: Iterable<T>): boolean;
    /**
     * Returns true if this set and the other set have no elements in common.
     */
    isDisjointFrom(other: Iterable<T>): boolean;
    [Symbol.iterator](): Iterator<T>;
    forEach(action: (element: T, index: number) => void): void;
    toArray(): T[];
    /**
     * Creates a shallow copy of this set.
     */
    clone(): HashSet<T>;
    /**
     * Returns statistics about the underlying hash table.
     */
    getStats(): ReturnType<HashMap<T, symbol>["getStats"]>;
    /**
     * Returns a string representation for debugging.
     */
    toString(): string;
}
/**
 * Factory function to create a HashSet.
 *
 * @example
 * const set = hashSet<number>()
 * const setFromArray = hashSet([1, 2, 3, 2, 1]) // {1, 2, 3}
 * const setWithOptions = hashSet<string>({ initialCapacity: 32 })
 */
export declare function hashSet<T>(optionsOrElements?: HashSetOptions<T> | Iterable<T>): HashSet<T>;
//# sourceMappingURL=hash-set.d.ts.map