/**
 * List interfaces that mirror Java's List interface.
 *
 * Lists are ordered collections that allow duplicate elements
 * and provide positional (indexed) access to elements.
 */

import type { Collection, ReadonlyCollection } from "./collection.js";
import type { Compare } from "../core/traits.js";

/**
 * ReadonlyList<T> - Readonly ordered collection with indexed access.
 *
 * Mirrors java.util.List but without mutation operations.
 * Elements maintain their insertion order and can be accessed by index.
 */
export interface ReadonlyList<T> extends ReadonlyCollection<T> {
  /**
   * Returns the element at the specified position.
   *
   * @param index The index of the element to return (0-based)
   * @returns The element at the specified position
   * @throws RangeError if index is out of bounds
   */
  get(index: number): T;

  /**
   * Returns the index of the first occurrence of the specified element,
   * or -1 if not found.
   *
   * @param element The element to search for
   * @param fromIndex Optional starting index for the search
   */
  indexOf(element: T, fromIndex?: number): number;

  /**
   * Returns the index of the last occurrence of the specified element,
   * or -1 if not found.
   *
   * @param element The element to search for
   * @param fromIndex Optional starting index for backwards search
   */
  lastIndexOf(element: T, fromIndex?: number): number;

  /**
   * Returns a view of the portion of this list between fromIndex (inclusive)
   * and toIndex (exclusive).
   *
   * Changes to the sublist are reflected in the original list.
   *
   * @param fromIndex Start index (inclusive)
   * @param toIndex End index (exclusive)
   */
  subList(fromIndex: number, toIndex: number): ReadonlyList<T>;

  /**
   * Returns the first element in the list.
   *
   * @throws Error if list is empty
   */
  first(): T;

  /**
   * Returns the last element in the list.
   *
   * @throws Error if list is empty
   */
  last(): T;
}

/**
 * List<T> - Mutable ordered collection with indexed access.
 *
 * Mirrors java.util.List with full mutation capabilities.
 * Provides methods to insert, replace, and remove elements by index.
 */
export interface List<T> extends ReadonlyList<T>, Collection<T> {
  /**
   * Replaces the element at the specified position.
   *
   * @param index The index of the element to replace
   * @param element The new element
   * @returns The element previously at the specified position
   * @throws RangeError if index is out of bounds
   */
  set(index: number, element: T): T;

  /**
   * Inserts an element at the specified position.
   * Shifts elements at and after the position to the right.
   *
   * @param index The index at which to insert
   * @param element The element to insert
   * @throws RangeError if index is out of bounds (0 to size inclusive)
   */
  insert(index: number, element: T): void;

  /**
   * Inserts all elements from the specified collection at the specified position.
   *
   * @param index The index at which to insert
   * @param other The collection whose elements to insert
   * @returns true if the list changed
   */
  insertAll(index: number, other: Iterable<T>): boolean;

  /**
   * Removes the element at the specified position.
   * Shifts elements after the position to the left.
   *
   * @param index The index of the element to remove
   * @returns The element that was removed
   * @throws RangeError if index is out of bounds
   */
  removeAt(index: number): T;

  /**
   * Removes elements in the specified index range.
   *
   * @param fromIndex Start index (inclusive)
   * @param toIndex End index (exclusive)
   */
  removeRange(fromIndex: number, toIndex: number): void;

  /**
   * Sorts this list according to the specified comparator.
   *
   * @param compare The comparison function
   */
  sort(compare?: Compare<T>): void;

  /**
   * Reverses the order of elements in this list.
   */
  reverse(): void;

  /**
   * Returns a mutable sublist view.
   *
   * @param fromIndex Start index (inclusive)
   * @param toIndex End index (exclusive)
   */
  subList(fromIndex: number, toIndex: number): List<T>;

  // Stack-like operations

  /**
   * Appends an element to the end of this list.
   * Equivalent to add() but doesn't return boolean.
   *
   * @param element The element to append
   */
  push(element: T): void;

  /**
   * Removes and returns the last element in this list.
   *
   * @returns The last element
   * @throws Error if list is empty
   */
  pop(): T;

  /**
   * Removes and returns the first element in this list.
   *
   * @returns The first element
   * @throws Error if list is empty
   */
  shift(): T;

  /**
   * Prepends an element to the beginning of this list.
   *
   * @param element The element to prepend
   */
  unshift(element: T): void;
}

/**
 * RandomAccess - Marker interface for lists with O(1) indexed access.
 *
 * Indicates that the list provides fast (constant-time) random access.
 * Examples: ArrayList (yes), LinkedList (no).
 */
export interface RandomAccess {
  /**
   * Marker property to indicate random access capability.
   * Always true for collections implementing this interface.
   */
  readonly supportsRandomAccess: true;
}

/**
 * Stack<T> - LIFO (Last-In-First-Out) collection.
 *
 * A stack of elements with push/pop operations.
 * Can be implemented as a specialized list or standalone.
 */
export interface Stack<T> extends Iterable<T> {
  /** Number of elements */
  readonly size: number;

  /** True if empty */
  readonly isEmpty: boolean;

  /**
   * Pushes an element onto the stack.
   */
  push(element: T): void;

  /**
   * Removes and returns the top element.
   *
   * @throws Error if stack is empty
   */
  pop(): T;

  /**
   * Returns the top element without removing it.
   *
   * @throws Error if stack is empty
   */
  peek(): T;

  /**
   * Removes all elements.
   */
  clear(): void;

  /**
   * Searches for an element and returns its distance from the top.
   * Returns -1 if not found.
   */
  search(element: T): number;
}

/**
 * Vector<T> - Synchronized growable array.
 *
 * Like ArrayList but with synchronized access.
 * Legacy interface from Java; in our framework, use compose(synchronized())(arrayList()) instead.
 */
export interface Vector<T> extends List<T> {
  /**
   * Current capacity of the underlying array.
   */
  readonly capacity: number;

  /**
   * Trims capacity to current size to minimize memory usage.
   */
  trimToSize(): void;

  /**
   * Increases capacity to ensure it can hold at least the specified number of elements.
   */
  ensureCapacity(minCapacity: number): void;
}

/**
 * CircularList<T> - List with circular/ring buffer behavior.
 *
 * When capacity is reached, oldest elements are overwritten.
 * Useful for fixed-size buffers like logs or history.
 */
export interface CircularList<T> extends List<T> {
  /**
   * Maximum capacity of the circular list.
   */
  readonly capacity: number;

  /**
   * Returns true if the list has reached capacity.
   */
  readonly isFull: boolean;

  /**
   * Number of elements that have been overwritten.
   */
  readonly overwriteCount: number;
}
