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
import { defaultEq, defaultCompare } from "../utils/defaults.js";

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
export class ArrayList<T> implements List<T>, RandomAccess {
  private _array: T[];
  private _size: number;
  private readonly _eq: Eq<T>;

  readonly supportsRandomAccess = true as const;

  constructor(options: ArrayListOptions<T> = {}) {
    const { initialCapacity = 10, eq = defaultEq } = options;
    this._array = new Array(initialCapacity);
    this._size = 0;
    this._eq = eq;
  }

  // ========================================================================
  // Size and capacity
  // ========================================================================

  get size(): number {
    return this._size;
  }

  get isEmpty(): boolean {
    return this._size === 0;
  }

  /**
   * Current capacity of the underlying array.
   */
  get capacity(): number {
    return this._array.length;
  }

  get eq(): Eq<T> {
    return this._eq;
  }

  // ========================================================================
  // Indexed access
  // ========================================================================

  get(index: number): T {
    this.checkIndex(index);
    return this._array[index]!;
  }

  set(index: number, element: T): T {
    this.checkIndex(index);
    const old = this._array[index]!;
    this._array[index] = element;
    return old!;
  }

  // ========================================================================
  // Search
  // ========================================================================

  contains(element: T): boolean {
    return this.indexOf(element) !== -1;
  }

  indexOf(element: T, fromIndex: number = 0): number {
    if (fromIndex < 0) fromIndex = 0;
    for (let i = fromIndex; i < this._size; i++) {
      if (this._eq(this._array[i]!, element)) {
        return i;
      }
    }
    return -1;
  }

  lastIndexOf(element: T, fromIndex?: number): number {
    const start =
      fromIndex !== undefined
        ? Math.min(fromIndex, this._size - 1)
        : this._size - 1;
    for (let i = start; i >= 0; i--) {
      if (this._eq(this._array[i]!, element)) {
        return i;
      }
    }
    return -1;
  }

  containsAll(other: Iterable<T>): boolean {
    for (const element of other) {
      if (!this.contains(element)) return false;
    }
    return true;
  }

  // ========================================================================
  // Addition
  // ========================================================================

  add(element: T): boolean {
    this.ensureCapacity(this._size + 1);
    this._array[this._size++] = element;
    return true;
  }

  push(element: T): void {
    this.add(element);
  }

  unshift(element: T): void {
    this.insert(0, element);
  }

  insert(index: number, element: T): void {
    this.checkInsertIndex(index);
    this.ensureCapacity(this._size + 1);

    // Shift elements to the right
    for (let i = this._size; i > index; i--) {
      this._array[i] = this._array[i - 1]!;
    }

    this._array[index] = element;
    this._size++;
  }

  insertAll(index: number, other: Iterable<T>): boolean {
    this.checkInsertIndex(index);
    const elements = Array.isArray(other) ? other : Array.from(other);
    if (elements.length === 0) return false;

    this.ensureCapacity(this._size + elements.length);

    // Shift existing elements to the right
    for (let i = this._size - 1; i >= index; i--) {
      this._array[i + elements.length] = this._array[i]!;
    }

    // Insert new elements
    for (let i = 0; i < elements.length; i++) {
      this._array[index + i] = elements[i];
    }

    this._size += elements.length;
    return true;
  }

  addAll(other: Iterable<T>): boolean {
    const elements = Array.isArray(other) ? other : Array.from(other);
    if (elements.length === 0) return false;

    this.ensureCapacity(this._size + elements.length);

    for (const element of elements) {
      this._array[this._size++] = element;
    }

    return true;
  }

  // ========================================================================
  // Removal
  // ========================================================================

  remove(element: T): boolean {
    const index = this.indexOf(element);
    if (index === -1) return false;
    this.removeAt(index);
    return true;
  }

  removeAt(index: number): T {
    this.checkIndex(index);
    const old = this._array[index]!;

    // Shift elements to the left
    for (let i = index; i < this._size - 1; i++) {
      this._array[i] = this._array[i + 1]!;
    }

    this._size--;
    // Clear the last element to allow GC
    this._array[this._size] = undefined as any;

    return old;
  }

  pop(): T {
    if (this.isEmpty) {
      throw new Error("Cannot pop from empty list");
    }
    return this.removeAt(this._size - 1);
  }

  shift(): T {
    if (this.isEmpty) {
      throw new Error("Cannot shift from empty list");
    }
    return this.removeAt(0);
  }

  removeRange(fromIndex: number, toIndex: number): void {
    this.checkRange(fromIndex, toIndex);
    const numToRemove = toIndex - fromIndex;
    if (numToRemove === 0) return;

    // Shift elements to the left
    for (let i = toIndex; i < this._size; i++) {
      this._array[i - numToRemove] = this._array[i]!;
    }

    // Clear removed elements
    for (let i = this._size - numToRemove; i < this._size; i++) {
      this._array[i] = undefined as any;
    }

    this._size -= numToRemove;
  }

  removeAll(other: Iterable<T>): boolean {
    const toRemove = new Set<T>();
    for (const element of other) {
      toRemove.add(element);
    }

    let writeIndex = 0;
    let modified = false;

    for (let readIndex = 0; readIndex < this._size; readIndex++) {
      const element = this._array[readIndex]!;
      let shouldRemove = false;

      // Check if element matches any in toRemove using custom equality
      for (const removeElement of toRemove) {
        if (this._eq(element, removeElement)) {
          shouldRemove = true;
          modified = true;
          break;
        }
      }

      if (!shouldRemove) {
        this._array[writeIndex++] = element;
      }
    }

    // Clear remaining elements
    for (let i = writeIndex; i < this._size; i++) {
      this._array[i] = undefined as any;
    }

    this._size = writeIndex;
    return modified;
  }

  retainAll(other: Iterable<T>): boolean {
    const toRetain = Array.from(other);
    let writeIndex = 0;
    let modified = false;

    for (let readIndex = 0; readIndex < this._size; readIndex++) {
      const element = this._array[readIndex]!;
      let shouldRetain = false;

      // Check if element matches any in toRetain using custom equality
      for (const retainElement of toRetain) {
        if (this._eq(element, retainElement)) {
          shouldRetain = true;
          break;
        }
      }

      if (shouldRetain) {
        this._array[writeIndex++] = element;
      } else {
        modified = true;
      }
    }

    // Clear remaining elements
    for (let i = writeIndex; i < this._size; i++) {
      this._array[i] = undefined as any;
    }

    this._size = writeIndex;
    return modified;
  }

  clear(): void {
    // Clear all elements to allow GC
    for (let i = 0; i < this._size; i++) {
      this._array[i] = undefined as any;
    }
    this._size = 0;
  }

  // ========================================================================
  // Ordering
  // ========================================================================

  sort(compare: Compare<T> = defaultCompare): void {
    // Sort only the used portion of the array
    const slice = this._array.slice(0, this._size);
    slice.sort(compare);
    for (let i = 0; i < this._size; i++) {
      this._array[i] = slice[i]!;
    }
  }

  reverse(): void {
    let left = 0;
    let right = this._size - 1;
    while (left < right) {
      const temp = this._array[left]!;
      this._array[left] = this._array[right]!;
      this._array[right] = temp;
      left++;
      right--;
    }
  }

  // ========================================================================
  // Views
  // ========================================================================

  first(): T {
    if (this.isEmpty) {
      throw new Error("List is empty");
    }
    return this._array[0]!;
  }

  last(): T {
    if (this.isEmpty) {
      throw new Error("List is empty");
    }
    return this._array[this._size - 1]!;
  }

  subList(fromIndex: number, toIndex: number): List<T> {
    this.checkRange(fromIndex, toIndex);
    // For now, return a copy. Later we can implement a view.
    const sub = new ArrayList<T>({ eq: this._eq });
    for (let i = fromIndex; i < toIndex; i++) {
      sub.add(this._array[i]!);
    }
    return sub;
  }

  // ========================================================================
  // Iteration
  // ========================================================================

  *[Symbol.iterator](): Iterator<T> {
    for (let i = 0; i < this._size; i++) {
      yield this._array[i]!;
    }
  }

  forEach(action: (element: T, index: number) => void): void {
    for (let i = 0; i < this._size; i++) {
      action(this._array[i]!, i);
    }
  }

  toArray(): T[] {
    return this._array.slice(0, this._size);
  }

  // ========================================================================
  // Capacity management
  // ========================================================================

  /**
   * Ensures that the capacity is at least the specified minimum.
   */
  ensureCapacity(minCapacity: number): void {
    if (minCapacity <= this._array.length) return;

    // Grow by 1.5x or to minCapacity, whichever is larger
    const newCapacity = Math.max(
      minCapacity,
      Math.floor(this._array.length * 1.5) + 1
    );

    const newArray = new Array(newCapacity);
    for (let i = 0; i < this._size; i++) {
      newArray[i] = this._array[i];
    }
    this._array = newArray;
  }

  /**
   * Trims the capacity to the current size to minimize memory usage.
   */
  trimToSize(): void {
    if (this._size < this._array.length) {
      this._array = this._array.slice(0, this._size);
    }
  }

  // ========================================================================
  // Private helpers
  // ========================================================================

  private checkIndex(index: number): void {
    if (index < 0 || index >= this._size) {
      throw new RangeError(
        `Index ${index} out of bounds for size ${this._size}`
      );
    }
  }

  private checkInsertIndex(index: number): void {
    if (index < 0 || index > this._size) {
      throw new RangeError(
        `Index ${index} out of bounds for insert (size ${this._size})`
      );
    }
  }

  private checkRange(fromIndex: number, toIndex: number): void {
    if (fromIndex < 0 || toIndex > this._size || fromIndex > toIndex) {
      throw new RangeError(
        `Invalid range [${fromIndex}, ${toIndex}) for size ${this._size}`
      );
    }
  }
}

/**
 * Factory function to create an ArrayList.
 *
 * @example
 * const list = arrayList<number>()
 * const listWithEq = arrayList<User>({ eq: (a, b) => a.id === b.id })
 * const listFromArray = arrayList([1, 2, 3])
 */
export function arrayList<T>(
  optionsOrElements?: ArrayListOptions<T> | Iterable<T>
): ArrayList<T> {
  // Check if it's an iterable (not options)
  if (optionsOrElements && Symbol.iterator in optionsOrElements) {
    const list = new ArrayList<T>();
    list.addAll(optionsOrElements as Iterable<T>);
    return list;
  }

  const list = new ArrayList<T>(optionsOrElements as ArrayListOptions<T>);
  return list;
}
