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
import { defaultEq, defaultCompare } from "../utils/defaults.js";

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
export class PriorityQueue<T> implements IPriorityQueue<T> {
  private _heap: T[];
  private readonly _compare: Compare<T>;
  private readonly _eq: Eq<T>;

  constructor(options: PriorityQueueOptions<T> = {}) {
    const {
      initialCapacity = 11,
      compare = defaultCompare,
      eq = defaultEq,
    } = options;

    this._heap = new Array(initialCapacity);
    this._compare = compare;
    this._eq = eq;
  }

  // ========================================================================
  // Size
  // ========================================================================

  get size(): number {
    return this._heap.length;
  }

  get isEmpty(): boolean {
    return this._heap.length === 0;
  }

  get eq(): Eq<T> {
    return this._eq;
  }

  get compare(): Compare<T> {
    return this._compare;
  }

  get comparator(): Compare<T> {
    return this._compare;
  }

  // ========================================================================
  // Priority queue operations
  // ========================================================================

  offer(element: T): boolean {
    this._heap.push(element);
    this.bubbleUp(this._heap.length - 1);
    return true;
  }

  poll(): T {
    if (this.isEmpty) {
      throw new Error("Priority queue is empty");
    }
    return this.pollOrUndefined()!;
  }

  pollOrUndefined(): T | undefined {
    if (this.isEmpty) {
      return undefined;
    }

    const result = this._heap[0];

    if (this._heap.length === 1) {
      this._heap.pop();
    } else {
      this._heap[0] = this._heap.pop()!;
      this.bubbleDown(0);
    }

    return result;
  }

  peek(): T {
    if (this.isEmpty) {
      throw new Error("Priority queue is empty");
    }
    return this._heap[0]!;
  }

  peekOrUndefined(): T | undefined {
    return this.isEmpty ? undefined : this._heap[0];
  }

  // ========================================================================
  // Queue interface compatibility
  // ========================================================================

  enqueue(element: T): boolean {
    return this.offer(element);
  }

  dequeue(): T {
    return this.poll();
  }

  // ========================================================================
  // Collection operations
  // ========================================================================

  add(element: T): boolean {
    return this.offer(element);
  }

  addAll(other: Iterable<T>): boolean {
    let modified = false;
    for (const element of other) {
      this.offer(element);
      modified = true;
    }
    return modified;
  }

  contains(element: T): boolean {
    for (const item of this._heap) {
      if (this._eq(item, element)) {
        return true;
      }
    }
    return false;
  }

  containsAll(other: Iterable<T>): boolean {
    for (const element of other) {
      if (!this.contains(element)) {
        return false;
      }
    }
    return true;
  }

  remove(element: T): boolean {
    const index = this._heap.findIndex((item) => this._eq(item, element));
    if (index === -1) {
      return false;
    }

    if (index === this._heap.length - 1) {
      this._heap.pop();
    } else {
      this._heap[index] = this._heap.pop()!;
      this.bubbleDown(index);
      this.bubbleUp(index);
    }

    return true;
  }

  removeAll(other: Iterable<T>): boolean {
    let modified = false;
    for (const element of other) {
      while (this.remove(element)) {
        modified = true;
      }
    }
    return modified;
  }

  retainAll(other: Iterable<T>): boolean {
    const toRetain = new Set(other);
    const newHeap: T[] = [];

    for (const element of this._heap) {
      let shouldRetain = false;
      for (const retainElement of toRetain) {
        if (this._eq(element, retainElement)) {
          shouldRetain = true;
          break;
        }
      }
      if (shouldRetain) {
        newHeap.push(element);
      }
    }

    const modified = newHeap.length !== this._heap.length;
    this._heap = newHeap;
    this.heapify();

    return modified;
  }

  clear(): void {
    this._heap = [];
  }

  // ========================================================================
  // Iteration
  // ========================================================================

  /**
   * Iterator returns elements in arbitrary order (not priority order).
   * To get elements in priority order, repeatedly call poll().
   */
  *[Symbol.iterator](): Iterator<T> {
    yield* this._heap;
  }

  forEach(action: (element: T, index: number) => void): void {
    this._heap.forEach((element, index) => action(element, index));
  }

  /**
   * Returns elements in arbitrary heap order (not sorted).
   */
  toArray(): T[] {
    return this._heap.slice();
  }

  /**
   * Returns elements in priority order (sorted).
   * This is a destructive operation that drains the queue.
   */
  toSortedArray(): T[] {
    const result: T[] = [];
    const clone = this.clone();

    while (!clone.isEmpty) {
      result.push(clone.poll());
    }

    return result;
  }

  // ========================================================================
  // Heap operations
  // ========================================================================

  /**
   * Bubbles an element up the heap to maintain heap property.
   */
  private bubbleUp(index: number): void {
    const element = this._heap[index]!;

    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      const parent = this._heap[parentIndex]!;

      if (this._compare(element, parent) >= 0) {
        break;
      }

      this._heap[index] = parent;
      index = parentIndex;
    }

    this._heap[index] = element;
  }

  /**
   * Bubbles an element down the heap to maintain heap property.
   */
  private bubbleDown(index: number): void {
    const length = this._heap.length;
    const element = this._heap[index]!;

    while (true) {
      const leftChildIndex = 2 * index + 1;
      const rightChildIndex = 2 * index + 2;
      let smallestIndex = index;

      if (
        leftChildIndex < length &&
        this._compare(this._heap[leftChildIndex]!, this._heap[smallestIndex]!) < 0
      ) {
        smallestIndex = leftChildIndex;
      }

      if (
        rightChildIndex < length &&
        this._compare(this._heap[rightChildIndex]!, this._heap[smallestIndex]!) < 0
      ) {
        smallestIndex = rightChildIndex;
      }

      if (smallestIndex === index) {
        break;
      }

      this._heap[index] = this._heap[smallestIndex]!;
      index = smallestIndex;
    }

    this._heap[index] = element;
  }

  /**
   * Rebuilds the heap from an arbitrary array.
   * Uses Floyd's algorithm (O(n) time).
   */
  private heapify(): void {
    // Start from last non-leaf node and bubble down
    for (let i = Math.floor(this._heap.length / 2) - 1; i >= 0; i--) {
      this.bubbleDown(i);
    }
  }

  // ========================================================================
  // Utility methods
  // ========================================================================

  /**
   * Creates a shallow copy of this priority queue.
   */
  clone(): PriorityQueue<T> {
    const clone = new PriorityQueue<T>({
      compare: this._compare,
      eq: this._eq,
    });
    clone._heap = this._heap.slice();
    return clone;
  }

  /**
   * Validates the heap property (for debugging).
   * Returns true if the heap is valid.
   */
  validate(): boolean {
    for (let i = 0; i < this._heap.length; i++) {
      const leftChildIndex = 2 * i + 1;
      const rightChildIndex = 2 * i + 2;

      if (
        leftChildIndex < this._heap.length &&
        this._compare(this._heap[i]!, this._heap[leftChildIndex]!) > 0
      ) {
        return false;
      }

      if (
        rightChildIndex < this._heap.length &&
        this._compare(this._heap[i]!, this._heap[rightChildIndex]!) > 0
      ) {
        return false;
      }
    }

    return true;
  }

  /**
   * Returns a string representation for debugging.
   */
  toString(): string {
    return `PriorityQueue[${this._heap.join(", ")}]`;
  }
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
export function priorityQueue<T>(
  optionsOrElementsOrComparator?:
    | PriorityQueueOptions<T>
    | Iterable<T>
    | Compare<T>
): PriorityQueue<T> {
  // If it's a function, treat it as a comparator
  if (typeof optionsOrElementsOrComparator === "function") {
    return new PriorityQueue<T>({
      compare: optionsOrElementsOrComparator as Compare<T>,
    });
  }

  // Check if it's an iterable (not options)
  if (optionsOrElementsOrComparator && Symbol.iterator in optionsOrElementsOrComparator) {
    const pq = new PriorityQueue<T>();
    pq.addAll(optionsOrElementsOrComparator as Iterable<T>);
    return pq;
  }

  return new PriorityQueue<T>(
    optionsOrElementsOrComparator as PriorityQueueOptions<T>
  );
}
