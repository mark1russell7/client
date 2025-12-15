/**
 * ArrayList implementation - A dynamic array-backed list.
 *
 * Provides O(1) indexed access and amortized O(1) append.
 * Mirrors java.util.ArrayList.
 *
 * @example
 * const list = arrayList<number>()
 * list.add(1)
 * list.add(2)
 * list.add(3)
 * console.log(list.get(1)) // 2
 */
import type { List, RandomAccess } from "../interfaces/list.js";
import type { Eq, Compare } from "../core/traits.js";
/**
 * Options for creating an ArrayList.
 */
export interface ArrayListOptions<T> {
    /**
     * Initial capacity of the underlying array.
     * @default 10
     */
    initialCapacity?: number;
    /**
     * Equality function for comparing elements.
     * @default defaultEq (===)
     */
    eq?: Eq<T>;
}
/**
 * ArrayList<T> - Resizable array implementation of the List interface.
 *
 * Provides fast random access (O(1)) and fast append (amortized O(1)).
 * Insertion and removal in the middle require shifting elements (O(n)).
 *
 * This is the most commonly used list implementation.
 */
export declare class ArrayList<T> implements List<T>, RandomAccess {
    private _array;
    private _size;
    private readonly _eq;
    readonly supportsRandomAccess: true;
    constructor(options?: ArrayListOptions<T>);
    get size(): number;
    get isEmpty(): boolean;
    /**
     * Current capacity of the underlying array.
     */
    get capacity(): number;
    get eq(): Eq<T>;
    get(index: number): T;
    set(index: number, element: T): T;
    contains(element: T): boolean;
    indexOf(element: T, fromIndex?: number): number;
    lastIndexOf(element: T, fromIndex?: number): number;
    containsAll(other: Iterable<T>): boolean;
    add(element: T): boolean;
    push(element: T): void;
    unshift(element: T): void;
    insert(index: number, element: T): void;
    insertAll(index: number, other: Iterable<T>): boolean;
    addAll(other: Iterable<T>): boolean;
    remove(element: T): boolean;
    removeAt(index: number): T;
    pop(): T;
    shift(): T;
    removeRange(fromIndex: number, toIndex: number): void;
    removeAll(other: Iterable<T>): boolean;
    retainAll(other: Iterable<T>): boolean;
    clear(): void;
    sort(compare?: Compare<T>): void;
    reverse(): void;
    first(): T;
    last(): T;
    subList(fromIndex: number, toIndex: number): List<T>;
    [Symbol.iterator](): Iterator<T>;
    forEach(action: (element: T, index: number) => void): void;
    toArray(): T[];
    /**
     * Ensures that the capacity is at least the specified minimum.
     */
    ensureCapacity(minCapacity: number): void;
    /**
     * Trims the capacity to the current size to minimize memory usage.
     */
    trimToSize(): void;
    private checkIndex;
    private checkInsertIndex;
    private checkRange;
}
/**
 * Factory function to create an ArrayList.
 *
 * @example
 * const list = arrayList<number>()
 * const listWithEq = arrayList<User>({ eq: (a, b) => a.id === b.id })
 * const listFromArray = arrayList([1, 2, 3])
 */
export declare function arrayList<T>(optionsOrElements?: ArrayListOptions<T> | Iterable<T>): ArrayList<T>;
//# sourceMappingURL=array-list.d.ts.map