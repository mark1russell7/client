/**
 * PriorityQueue implementation - A binary heap-based priority queue.
 *
 * Elements are ordered according to their natural ordering (via comparator).
 * The head of the queue is the least element according to the comparator.
 * Provides O(log n) enqueue and O(log n) dequeue operations.
 * Mirrors java.util.PriorityQueue.
 *
 * @example
 * const pq = priorityQueue<number>((a, b) => a - b) // Min heap
 * pq.offer(5)
 * pq.offer(2)
 * pq.offer(8)
 * pq.poll() // 2 (smallest element)
 */
import type { PriorityQueue as IPriorityQueue } from "../interfaces/queue.js";
import type { Eq, Compare } from "../core/traits.js";
/**
 * Options for creating a PriorityQueue.
 */
export interface PriorityQueueOptions<T> {
    /**
     * Initial capacity of the heap.
     * @default 11
     */
    initialCapacity?: number;
    /**
     * Comparator for ordering elements.
     * Lower values have higher priority (min heap).
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
 * PriorityQueue<T> - Binary heap implementation of priority queue.
 *
 * Elements are always retrieved in priority order (according to comparator).
 * Not a FIFO queue - order depends on priority, not insertion order.
 *
 * The heap is a min heap by default (smallest element has highest priority).
 * For max heap, use reversed comparator: (a, b) => compare(b, a)
 *
 * Not thread-safe. Use synchronized() behavior for concurrent access.
 */
export declare class PriorityQueue<T> implements IPriorityQueue<T> {
    private _heap;
    private readonly _compare;
    private readonly _eq;
    constructor(options?: PriorityQueueOptions<T>);
    get size(): number;
    get isEmpty(): boolean;
    get eq(): Eq<T>;
    get compare(): Compare<T>;
    get comparator(): Compare<T>;
    offer(element: T): boolean;
    poll(): T;
    pollOrUndefined(): T | undefined;
    peek(): T;
    peekOrUndefined(): T | undefined;
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
    /**
     * Iterator returns elements in arbitrary order (not priority order).
     * To get elements in priority order, repeatedly call poll().
     */
    [Symbol.iterator](): Iterator<T>;
    forEach(action: (element: T, index: number) => void): void;
    /**
     * Returns elements in arbitrary heap order (not sorted).
     */
    toArray(): T[];
    /**
     * Returns elements in priority order (sorted).
     * This is a destructive operation that drains the queue.
     */
    toSortedArray(): T[];
    /**
     * Bubbles an element up the heap to maintain heap property.
     */
    private bubbleUp;
    /**
     * Bubbles an element down the heap to maintain heap property.
     */
    private bubbleDown;
    /**
     * Rebuilds the heap from an arbitrary array.
     * Uses Floyd's algorithm (O(n) time).
     */
    private heapify;
    /**
     * Creates a shallow copy of this priority queue.
     */
    clone(): PriorityQueue<T>;
    /**
     * Validates the heap property (for debugging).
     * Returns true if the heap is valid.
     */
    validate(): boolean;
    /**
     * Returns a string representation for debugging.
     */
    toString(): string;
}
/**
 * Factory function to create a PriorityQueue.
 *
 * @example
 * // Min heap (default)
 * const minHeap = priorityQueue<number>()
 *
 * // Max heap
 * const maxHeap = priorityQueue<number>((a, b) => b - a)
 *
 * // From array
 * const pq = priorityQueue([5, 2, 8, 1, 9])
 *
 * // With custom comparator
 * const pq = priorityQueue<Task>((a, b) => a.priority - b.priority)
 */
export declare function priorityQueue<T>(optionsOrElementsOrComparator?: PriorityQueueOptions<T> | Iterable<T> | Compare<T>): PriorityQueue<T>;
//# sourceMappingURL=priority-queue.d.ts.map