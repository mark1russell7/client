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
import { defaultEq } from "../utils/defaults.js";

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
export class ArrayDeque<T> implements Deque<T> {
  private _elements: (T | undefined)[];
  private _head: number; // Index of first element
  private _tail: number; // Index where next element will be added
  private readonly _eq: Eq<T>;

  constructor(options: ArrayDequeOptions<T> = {}) {
    const { initialCapacity = 16, eq = defaultEq } = options;
    // Ensure capacity is a power of 2 for efficient modulo using bitwise AND
    const capacity = this.nextPowerOfTwo(Math.max(8, initialCapacity));
    this._elements = new Array(capacity);
    this._head = 0;
    this._tail = 0;
    this._eq = eq;
  }

  // ========================================================================
  // Size
  // ========================================================================

  get size(): number {
    // Handle wraparound: (tail - head) & mask
    return (this._tail - this._head) & (this._elements.length - 1);
  }

  get isEmpty(): boolean {
    return this._head === this._tail;
  }

  get eq(): Eq<T> {
    return this._eq;
  }

  // ========================================================================
  // Front operations (head)
  // ========================================================================

  addFirst(element: T): void {
    this._head = (this._head - 1) & (this._elements.length - 1);
    this._elements[this._head] = element;
    if (this._head === this._tail) {
      this.grow();
    }
  }

  offerFirst(element: T): boolean {
    this.addFirst(element);
    return true;
  }

  removeFirst(): T {
    if (this.isEmpty) {
      throw new Error("Deque is empty");
    }
    return this.pollFirst()!;
  }

  pollFirst(): T | undefined {
    if (this.isEmpty) {
      return undefined;
    }
    const element = this._elements[this._head];
    this._elements[this._head] = undefined;
    this._head = (this._head + 1) & (this._elements.length - 1);
    return element;
  }

  peekFirst(): T {
    if (this.isEmpty) {
      throw new Error("Deque is empty");
    }
    return this._elements[this._head]!;
  }

  peekFirstOrUndefined(): T | undefined {
    return this.isEmpty ? undefined : this._elements[this._head];
  }

  // ========================================================================
  // Back operations (tail)
  // ========================================================================

  addLast(element: T): void {
    this._elements[this._tail] = element;
    this._tail = (this._tail + 1) & (this._elements.length - 1);
    if (this._tail === this._head) {
      this.grow();
    }
  }

  offerLast(element: T): boolean {
    this.addLast(element);
    return true;
  }

  removeLast(): T {
    if (this.isEmpty) {
      throw new Error("Deque is empty");
    }
    return this.pollLast()!;
  }

  pollLast(): T | undefined {
    if (this.isEmpty) {
      return undefined;
    }
    this._tail = (this._tail - 1) & (this._elements.length - 1);
    const element = this._elements[this._tail];
    this._elements[this._tail] = undefined;
    return element;
  }

  peekLast(): T {
    if (this.isEmpty) {
      throw new Error("Deque is empty");
    }
    const lastIndex = (this._tail - 1) & (this._elements.length - 1);
    return this._elements[lastIndex]!;
  }

  peekLastOrUndefined(): T | undefined {
    if (this.isEmpty) {
      return undefined;
    }
    const lastIndex = (this._tail - 1) & (this._elements.length - 1);
    return this._elements[lastIndex];
  }

  // ========================================================================
  // Stack operations (LIFO - use first end)
  // ========================================================================

  push(element: T): void {
    this.addFirst(element);
  }

  pop(): T {
    return this.removeFirst();
  }

  // ========================================================================
  // Queue operations (FIFO - add last, remove first)
  // ========================================================================

  offer(element: T): boolean {
    return this.offerLast(element);
  }

  poll(): T {
    return this.removeFirst();
  }

  peek(): T {
    return this.peekFirst();
  }

  peekOrUndefined(): T | undefined {
    return this.peekFirstOrUndefined();
  }

  pollOrUndefined(): T | undefined {
    return this.pollFirst();
  }

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
    this.addLast(element);
    return true;
  }

  addAll(other: Iterable<T>): boolean {
    let modified = false;
    for (const element of other) {
      this.addLast(element);
      modified = true;
    }
    return modified;
  }

  contains(element: T): boolean {
    for (const item of this) {
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
    // Linear search and remove first occurrence
    let index = this._head;
    let found = false;

    for (let i = 0; i < this.size; i++) {
      if (this._eq(this._elements[index]!, element)) {
        found = true;
        break;
      }
      index = (index + 1) & (this._elements.length - 1);
    }

    if (!found) return false;

    // Remove at index by shifting elements
    const isCloserToHead =
      (index - this._head) &
      (this._elements.length - 1 < this._tail - index ? 1 : 0) &
      (this._elements.length - 1);

    if (isCloserToHead) {
      // Shift elements from head to index forward
      while (index !== this._head) {
        const prevIndex = (index - 1) & (this._elements.length - 1);
        this._elements[index] = this._elements[prevIndex];
        index = prevIndex;
      }
      this._elements[this._head] = undefined;
      this._head = (this._head + 1) & (this._elements.length - 1);
    } else {
      // Shift elements from index to tail backward
      while (index !== this._tail) {
        const nextIndex = (index + 1) & (this._elements.length - 1);
        if (nextIndex === this._tail) break;
        this._elements[index] = this._elements[nextIndex];
        index = nextIndex;
      }
      this._tail = (this._tail - 1) & (this._elements.length - 1);
      this._elements[this._tail] = undefined;
    }

    return true;
  }

  removeAll(other: Iterable<T>): boolean {
    const toRemove = new Set<T>();
    for (const element of other) {
      toRemove.add(element);
    }

    let modified = false;
    for (const element of toRemove) {
      while (this.remove(element)) {
        modified = true;
      }
    }
    return modified;
  }

  retainAll(other: Iterable<T>): boolean {
    const toRetain = new Set(other);
    const newDeque = new ArrayDeque<T>({ eq: this._eq });

    for (const element of this) {
      let shouldRetain = false;
      for (const retainElement of toRetain) {
        if (this._eq(element, retainElement)) {
          shouldRetain = true;
          break;
        }
      }
      if (shouldRetain) {
        newDeque.addLast(element);
      }
    }

    const modified = newDeque.size !== this.size;
    this._elements = newDeque._elements;
    this._head = newDeque._head;
    this._tail = newDeque._tail;

    return modified;
  }

  clear(): void {
    // Clear all elements for GC
    let index = this._head;
    while (index !== this._tail) {
      this._elements[index] = undefined;
      index = (index + 1) & (this._elements.length - 1);
    }
    this._head = 0;
    this._tail = 0;
  }

  // ========================================================================
  // Iteration
  // ========================================================================

  *[Symbol.iterator](): Iterator<T> {
    let index = this._head;
    while (index !== this._tail) {
      yield this._elements[index]!;
      index = (index + 1) & (this._elements.length - 1);
    }
  }

  forEach(action: (element: T, index: number) => void): void {
    let arrayIndex = this._head;
    let logicalIndex = 0;
    while (arrayIndex !== this._tail) {
      action(this._elements[arrayIndex]!, logicalIndex);
      arrayIndex = (arrayIndex + 1) & (this._elements.length - 1);
      logicalIndex++;
    }
  }

  toArray(): T[] {
    const result: T[] = [];
    for (const element of this) {
      result.push(element);
    }
    return result;
  }

  // ========================================================================
  // Capacity management
  // ========================================================================

  /**
   * Doubles the capacity of the deque.
   */
  private grow(): void {
    const oldCapacity = this._elements.length;
    const newCapacity = oldCapacity << 1; // Double capacity

    if (newCapacity < 0) {
      throw new Error("Deque too large");
    }

    const newElements = new Array(newCapacity);
    const size = this.size;

    // Copy elements from head to end of old array
    const rightSize = oldCapacity - this._head;
    for (let i = 0; i < rightSize; i++) {
      newElements[i] = this._elements[this._head + i];
    }

    // Copy wrapped elements from start of old array
    const leftSize = this._head;
    for (let i = 0; i < leftSize; i++) {
      newElements[rightSize + i] = this._elements[i];
    }

    this._elements = newElements;
    this._head = 0;
    this._tail = size;
  }

  /**
   * Returns the next power of 2 >= n.
   */
  private nextPowerOfTwo(n: number): number {
    if (n <= 0) return 1;
    n--;
    n |= n >> 1;
    n |= n >> 2;
    n |= n >> 4;
    n |= n >> 8;
    n |= n >> 16;
    return n + 1;
  }

  // ========================================================================
  // Inspection
  // ========================================================================

  /**
   * Returns the current capacity of the underlying array.
   */
  get capacity(): number {
    return this._elements.length;
  }

  /**
   * Returns a string representation for debugging.
   */
  toString(): string {
    return `ArrayDeque[${this.toArray().join(", ")}]`;
  }
}

/**
 * Factory function to create an ArrayDeque.
 *
 * @example
 * const deque = arrayDeque<number>()
 * const dequeFromArray = arrayDeque([1, 2, 3])
 * const dequeWithOptions = arrayDeque<string>({ initialCapacity: 32 })
 */
export function arrayDeque<T>(
  optionsOrElements?: ArrayDequeOptions<T> | Iterable<T>
): ArrayDeque<T> {
  // Check if it's an iterable (not options)
  if (optionsOrElements && Symbol.iterator in optionsOrElements) {
    const deque = new ArrayDeque<T>();
    deque.addAll(optionsOrElements as Iterable<T>);
    return deque;
  }

  return new ArrayDeque<T>(optionsOrElements as ArrayDequeOptions<T>);
}
