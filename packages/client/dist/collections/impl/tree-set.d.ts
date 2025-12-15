/**
 * TreeSet - Red-black tree based sorted set implementation.
 *
 * Implements a sorted set using TreeMap as the backing structure.
 * Mirrors java.util.TreeSet.
 *
 * Key features:
 * - O(log n) add, remove, contains
 * - Elements maintained in sorted order (natural or custom comparator)
 * - Navigation methods (floor, ceiling, lower, higher)
 * - Range view operations (subSet, headSet, tailSet)
 *
 * @example
 * const set = treeSet<string>()
 * set.add('c')
 * set.add('a')
 * set.add('b')
 * // Iteration order: a, b, c (sorted)
 *
 * @example
 * // Custom comparator for descending order
 * const set = treeSet<number>({
 *   compare: (a, b) => b - a
 * })
 */
import type { SortedSet, NavigableSet } from "../interfaces/set.js";
import type { Eq, Compare } from "../core/traits.js";
/**
 * Options for creating a TreeSet.
 */
export interface TreeSetOptions<T> {
    /**
     * Comparison function for elements.
     * @default defaultCompare
     */
    compare?: Compare<T>;
    /**
     * Equality function for elements.
     * @default defaultEq
     */
    eq?: Eq<T>;
}
/**
 * TreeSet<T> - Red-black tree based sorted set.
 *
 * Maintains elements in sorted order using a TreeMap as backing structure.
 * Provides O(log n) operations and navigation methods.
 */
export declare class TreeSet<T> implements NavigableSet<T> {
    private readonly _map;
    private readonly _compare;
    private readonly _eq;
    constructor(options?: TreeSetOptions<T>);
    get size(): number;
    get isEmpty(): boolean;
    get comparator(): Compare<T>;
    get eq(): Eq<T>;
    has(element: T): boolean;
    contains(element: T): boolean;
    containsAll(other: Iterable<T>): boolean;
    add(element: T): boolean;
    remove(element: T): boolean;
    clear(): void;
    addAll(elements: Iterable<T>): boolean;
    removeAll(elements: Iterable<T>): boolean;
    retainAll(elements: Iterable<T>): boolean;
    union(other: Iterable<T>): TreeSet<T>;
    intersection(other: Iterable<T>): TreeSet<T>;
    difference(other: Iterable<T>): TreeSet<T>;
    symmetricDifference(other: Iterable<T>): TreeSet<T>;
    isSubsetOf(other: Iterable<T>): boolean;
    isSupersetOf(other: Iterable<T>): boolean;
    isDisjointFrom(other: Iterable<T>): boolean;
    first(): T;
    last(): T;
    headSet(toElement: T): SortedSet<T>;
    tailSet(fromElement: T): SortedSet<T>;
    subSet(fromElement: T, toElement: T): SortedSet<T>;
    floor(element: T): T | undefined;
    ceiling(element: T): T | undefined;
    lower(element: T): T | undefined;
    higher(element: T): T | undefined;
    pollFirst(): T | undefined;
    pollLast(): T | undefined;
    descendingSet(): NavigableSet<T>;
    descendingIterator(): IterableIterator<T>;
    [Symbol.iterator](): Iterator<T>;
    forEach(action: (element: T, index: number) => void): void;
    toArray(): T[];
    toString(): string;
}
/**
 * Factory function to create a TreeSet.
 *
 * @example
 * const set = treeSet<string>()
 * set.add('c')
 * set.add('a')
 * set.add('b')
 * // Iteration order: a, b, c
 *
 * @example
 * // With initial elements
 * const set = treeSet(['c', 'a', 'b'])
 * // Iteration order: a, b, c
 *
 * @example
 * // Custom comparator for descending order
 * const set = treeSet<number>({ compare: (a, b) => b - a })
 */
export declare function treeSet<T>(optionsOrElements?: TreeSetOptions<T> | Iterable<T>): TreeSet<T>;
//# sourceMappingURL=tree-set.d.ts.map