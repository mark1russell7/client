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
import { TreeMap } from "./tree-map.js";
import { defaultEq, defaultCompare } from "../utils/defaults.js";

/**
 * Dummy value used for TreeMap backing.
 */
const PRESENT = true;

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
export class TreeSet<T> implements NavigableSet<T> {
  private readonly _map: TreeMap<T, boolean>;
  private readonly _compare: Compare<T>;
  private readonly _eq: Eq<T>;

  constructor(options: TreeSetOptions<T> = {}) {
    const {
      compare = defaultCompare,
      eq = defaultEq,
    } = options;

    this._compare = compare;
    this._eq = eq;
    this._map = new TreeMap<T, boolean>({
      compare,
      eq,
    });
  }

  // ========================================================================
  // Size and state
  // ========================================================================

  get size(): number {
    return this._map.size;
  }

  get isEmpty(): boolean {
    return this._map.isEmpty;
  }

  get comparator(): Compare<T> {
    return this._compare;
  }

  get eq(): Eq<T> {
    return this._eq;
  }

  // ========================================================================
  // Membership operations
  // ========================================================================

  has(element: T): boolean {
    return this._map.has(element);
  }

  contains(element: T): boolean {
    return this.has(element);
  }

  containsAll(other: Iterable<T>): boolean {
    for (const element of other) {
      if (!this.has(element)) {
        return false;
      }
    }
    return true;
  }

  // ========================================================================
  // Modification operations
  // ========================================================================

  add(element: T): boolean {
    const oldValue = this._map.set(element, PRESENT);
    return oldValue === undefined; // Returns true if element was added (not already present)
  }

  remove(element: T): boolean {
    const removed = this._map.delete(element);
    return removed !== undefined;
  }

  clear(): void {
    this._map.clear();
  }

  // ========================================================================
  // Bulk operations
  // ========================================================================

  addAll(elements: Iterable<T>): boolean {
    let modified = false;
    for (const element of elements) {
      if (this.add(element)) {
        modified = true;
      }
    }
    return modified;
  }

  removeAll(elements: Iterable<T>): boolean {
    let modified = false;
    for (const element of elements) {
      if (this.remove(element)) {
        modified = true;
      }
    }
    return modified;
  }

  retainAll(elements: Iterable<T>): boolean {
    const toRetain = new Set<T>();
    for (const element of elements) {
      toRetain.add(element);
    }

    let modified = false;
    for (const element of Array.from(this)) {
      if (!toRetain.has(element)) {
        this.remove(element);
        modified = true;
      }
    }
    return modified;
  }

  // ========================================================================
  // Set operations
  // ========================================================================

  union(other: Iterable<T>): TreeSet<T> {
    const result = new TreeSet<T>({
      compare: this._compare,
      eq: this._eq,
    });

    for (const element of this) {
      result.add(element);
    }
    for (const element of other) {
      result.add(element);
    }

    return result;
  }

  intersection(other: Iterable<T>): TreeSet<T> {
    const result = new TreeSet<T>({
      compare: this._compare,
      eq: this._eq,
    });

    const otherSet = new Set<T>();
    for (const element of other) {
      otherSet.add(element);
    }

    for (const element of this) {
      if (otherSet.has(element)) {
        result.add(element);
      }
    }

    return result;
  }

  difference(other: Iterable<T>): TreeSet<T> {
    const result = new TreeSet<T>({
      compare: this._compare,
      eq: this._eq,
    });

    const otherSet = new Set<T>();
    for (const element of other) {
      otherSet.add(element);
    }

    for (const element of this) {
      if (!otherSet.has(element)) {
        result.add(element);
      }
    }

    return result;
  }

  symmetricDifference(other: Iterable<T>): TreeSet<T> {
    const result = new TreeSet<T>({
      compare: this._compare,
      eq: this._eq,
    });

    // Add all elements from this set
    for (const element of this) {
      result.add(element);
    }

    // Toggle elements from other set
    for (const element of other) {
      if (result.has(element)) {
        result.remove(element);
      } else {
        result.add(element);
      }
    }

    return result;
  }

  isSubsetOf(other: Iterable<T>): boolean {
    const otherSet = new Set<T>();
    for (const element of other) {
      otherSet.add(element);
    }

    for (const element of this) {
      if (!otherSet.has(element)) {
        return false;
      }
    }
    return true;
  }

  isSupersetOf(other: Iterable<T>): boolean {
    for (const element of other) {
      if (!this.has(element)) {
        return false;
      }
    }
    return true;
  }

  isDisjointFrom(other: Iterable<T>): boolean {
    for (const element of other) {
      if (this.has(element)) {
        return false;
      }
    }
    return true;
  }

  // ========================================================================
  // SortedSet operations
  // ========================================================================

  first(): T {
    const key = this._map.firstKey();
    return key;
  }

  last(): T {
    const key = this._map.lastKey();
    return key;
  }

  headSet(toElement: T): SortedSet<T> {
    const result = new TreeSet<T>({
      compare: this._compare,
      eq: this._eq,
    });

    for (const element of this) {
      if (this._compare(element, toElement) < 0) {
        result.add(element);
      } else {
        break; // Elements are sorted
      }
    }

    return result;
  }

  tailSet(fromElement: T): SortedSet<T> {
    const result = new TreeSet<T>({
      compare: this._compare,
      eq: this._eq,
    });

    let started = false;
    for (const element of this) {
      if (!started && this._compare(element, fromElement) < 0) {
        continue;
      }
      started = true;
      result.add(element);
    }

    return result;
  }

  subSet(fromElement: T, toElement: T): SortedSet<T> {
    const result = new TreeSet<T>({
      compare: this._compare,
      eq: this._eq,
    });

    for (const element of this) {
      const cmpFrom = this._compare(element, fromElement);
      const cmpTo = this._compare(element, toElement);

      if (cmpFrom >= 0 && cmpTo < 0) {
        result.add(element);
      } else if (cmpTo >= 0) {
        break; // Past the range
      }
    }

    return result;
  }

  // ========================================================================
  // NavigableSet operations
  // ========================================================================

  floor(element: T): T | undefined {
    return this._map.floorKey(element);
  }

  ceiling(element: T): T | undefined {
    return this._map.ceilingKey(element);
  }

  lower(element: T): T | undefined {
    return this._map.lowerKey(element);
  }

  higher(element: T): T | undefined {
    return this._map.higherKey(element);
  }

  pollFirst(): T | undefined {
    const entry = this._map.pollFirstEntry();
    return entry?.key;
  }

  pollLast(): T | undefined {
    const entry = this._map.pollLastEntry();
    return entry?.key;
  }

  descendingSet(): NavigableSet<T> {
    const reversed = new TreeSet<T>({
      compare: (a, b) => this._compare(b, a),
      eq: this._eq,
    });

    for (const element of this) {
      reversed.add(element);
    }

    return reversed;
  }

  *descendingIterator(): IterableIterator<T> {
    yield* this._map.descendingKeys();
  }

  // ========================================================================
  // View operations
  // ========================================================================

  *[Symbol.iterator](): Iterator<T> {
    yield* this._map.keys();
  }

  forEach(action: (element: T, index: number) => void): void {
    let index = 0;
    for (const element of this) {
      action(element, index++);
    }
  }

  toArray(): T[] {
    return Array.from(this);
  }

  // ========================================================================
  // Utility methods
  // ========================================================================

  toString(): string {
    const elements = Array.from(this).join(', ');
    return `TreeSet{${elements}}`;
  }
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
export function treeSet<T>(
  optionsOrElements?: TreeSetOptions<T> | Iterable<T>
): TreeSet<T> {
  if (optionsOrElements && Symbol.iterator in optionsOrElements) {
    const set = new TreeSet<T>();
    for (const element of optionsOrElements as Iterable<T>) {
      set.add(element);
    }
    return set;
  }

  return new TreeSet<T>(optionsOrElements as TreeSetOptions<T>);
}
