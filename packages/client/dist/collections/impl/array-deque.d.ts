/**
 * ArrayDeque implementation - A ring buffer backed double-ended queue.
 *
 * Provides O(1) insertion and removal at both ends.
 * More efficient than ArrayList for queue/stack operations.
 * Mirrors java.util.ArrayDeque.
 *
 * @example
 * const deque = arrayDeque<number>()
 * deque.addFirst(1)
 * deque.addLast(2)
 * deque.removeFirst() // 1
 */
import type { Deque } from "../interfaces/queue.js";
import type { Eq } from "../core/traits.js";
/**
 * Options for creating an ArrayDeque.
 */
export interface ArrayDequeOptions<T> {
    /**
     * Initial capacity of the underlying array.
     * Must be a power of 2 for efficient modulo operations.
     * @default 16
     */
    initialCapacity?: number;
    /**
     * Equality function for comparing elements.
     * @default defaultEq (===)
     */
    eq?: Eq<T>;
}
/**
 * ArrayDeque<T> - Ring buffer implementation of Deque.
 *
 * Uses a circular array to provide O(1) operations at both ends.
 * The array grows automatically when full.
 *
 * Not thread-safe. Use synchronized() behavior for concurrent access.
 */
export declare class ArrayDeque<T> implements Deque<T> {
    private _elements;
    private _head;
    private _tail;
    private readonly _eq;
    constructor(options?: ArrayDequeOptions<T>);
    get size(): number;
    get isEmpty(): boolean;
    get eq(): Eq<T>;
    addFirst(element: T): void;
    offerFirst(element: T): boolean;
    removeFirst(): T;
    pollFirst(): T | undefined;
    peekFirst(): T;
    peekFirstOrUndefined(): T | undefined;
    addLast(element: T): void;
    offerLast(element: T): boolean;
    removeLast(): T;
    pollLast(): T | undefined;
    peekLast(): T;
    peekLastOrUndefined(): T | undefined;
    push(element: T): void;
    pop(): T;
    offer(element: T): boolean;
    poll(): T;
    peek(): T;
    peekOrUndefined(): T | undefined;
    pollOrUndefined(): T | undefined;
    enqueue(element: T): boolean;
    dequeue(): T;
    add(element: T): boolean;
    addAll(other: Iterable<T>): boolean;
    contains(element: T): boolean;
    containsAll(other: Iterable<T>): boolean;
    remove(element: T): boolean;
    removeAll(other: Iterable<T>): boolean;
    retainAll(other: Iterable<T>): boolean;
    clear(): void;
    [Symbol.iterator](): Iterator<T>;
    forEach(action: (element: T, index: number) => void): void;
    toArray(): T[];
    /**
     * Doubles the capacity of the deque.
     */
    private grow;
    /**
     * Returns the next power of 2 >= n.
     */
    private nextPowerOfTwo;
    /**
     * Returns the current capacity of the underlying array.
     */
    get capacity(): number;
    /**
     * Returns a string representation for debugging.
     */
    toString(): string;
}
/**
 * Factory function to create an ArrayDeque.
 *
 * @example
 * const deque = arrayDeque<number>()
 * const dequeFromArray = arrayDeque([1, 2, 3])
 * const dequeWithOptions = arrayDeque<string>({ initialCapacity: 32 })
 */
export declare function arrayDeque<T>(optionsOrElements?: ArrayDequeOptions<T> | Iterable<T>): ArrayDeque<T>;
//# sourceMappingURL=array-deque.d.ts.map