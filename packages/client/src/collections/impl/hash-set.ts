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
import { defaultEq, defaultHash } from "../utils/defaults.js";

/**
 * Dummy value used for the HashMap backing the set.
 */
const PRESENT = Symbol("PRESENT");

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
export class HashSet<T> implements Set<T> {
  private readonly _map: HashMap<T, symbol>;
  private readonly _eq: Eq<T>;

  constructor(options: HashSetOptions<T> = {}) {
    const {
      initialCapacity = 16,
      loadFactor = 0.75,
      eq = defaultEq,
      hash = defaultHash,
    } = options;

    this._eq = eq;
    this._map = new HashMap<T, symbol>({
      initialCapacity,
      loadFactor,
      keyEq: eq,
      keyHash: hash,
    });
  }

  // ========================================================================
  // Size
  // ========================================================================

  get size(): number {
    return this._map.size;
  }

  get isEmpty(): boolean {
    return this._map.isEmpty;
  }

  get eq(): Eq<T> {
    return this._eq;
  }

  // ========================================================================
  // Core set operations
  // ========================================================================

  add(element: T): boolean {
    const hadElement = this._map.has(element);
    this._map.set(element, PRESENT);
    return !hadElement;
  }

  remove(element: T): boolean {
    return this._map.delete(element) !== undefined;
  }

  contains(element: T): boolean {
    return this._map.has(element);
  }

  // ========================================================================
  // Bulk operations
  // ========================================================================

  addAll(other: Iterable<T>): boolean {
    let modified = false;
    for (const element of other) {
      if (this.add(element)) {
        modified = true;
      }
    }
    return modified;
  }

  removeAll(other: Iterable<T>): boolean {
    let modified = false;
    for (const element of other) {
      if (this.remove(element)) {
        modified = true;
      }
    }
    return modified;
  }

  retainAll(other: Iterable<T>): boolean {
    const toRetain = new globalThis.Set(other);
    const toRemove: T[] = [];

    for (const element of this) {
      let shouldRetain = false;
      for (const retainElement of toRetain) {
        if (this._eq(element, retainElement)) {
          shouldRetain = true;
          break;
        }
      }
      if (!shouldRetain) {
        toRemove.push(element);
      }
    }

    let modified = false;
    for (const element of toRemove) {
      this.remove(element);
      modified = true;
    }

    return modified;
  }

  containsAll(other: Iterable<T>): boolean {
    for (const element of other) {
      if (!this.contains(element)) {
        return false;
      }
    }
    return true;
  }

  clear(): void {
    this._map.clear();
  }

  // ========================================================================
  // Set operations (mathematical)
  // ========================================================================

  /**
   * Returns a new set that is the union of this set and the other set.
   * Contains all elements from both sets.
   */
  union(other: Iterable<T>): HashSet<T> {
    const result = this.clone();
    result.addAll(other);
    return result;
  }

  /**
   * Returns a new set that is the intersection of this set and the other set.
   * Contains only elements present in both sets.
   */
  intersection(other: Iterable<T>): HashSet<T> {
    const result = new HashSet<T>({ eq: this._eq });
    for (const element of this) {
      for (const otherElement of other) {
        if (this._eq(element, otherElement)) {
          result.add(element);
          break;
        }
      }
    }
    return result;
  }

  /**
   * Returns a new set that is the difference of this set and the other set.
   * Contains elements in this set but not in the other set.
   */
  difference(other: Iterable<T>): HashSet<T> {
    const result = this.clone();
    result.removeAll(other);
    return result;
  }

  /**
   * Returns a new set that is the symmetric difference of this set and the other set.
   * Contains elements in either set but not in both.
   */
  symmetricDifference(other: Iterable<T>): HashSet<T> {
    const result = this.union(other);
    const inter = this.intersection(other);
    result.removeAll(inter);
    return result;
  }

  /**
   * Returns true if this set is a subset of the other set.
   * All elements in this set are also in the other set.
   */
  isSubsetOf(other: Iterable<T>): boolean {
    const otherSet = new HashSet<T>({ eq: this._eq });
    otherSet.addAll(other);

    for (const element of this) {
      if (!otherSet.contains(element)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Returns true if this set is a superset of the other set.
   * All elements in the other set are also in this set.
   */
  isSupersetOf(other: Iterable<T>): boolean {
    for (const element of other) {
      if (!this.contains(element)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Returns true if this set and the other set have no elements in common.
   */
  isDisjointFrom(other: Iterable<T>): boolean {
    for (const element of other) {
      if (this.contains(element)) {
        return false;
      }
    }
    return true;
  }

  // ========================================================================
  // Iteration
  // ========================================================================

  *[Symbol.iterator](): Iterator<T> {
    for (const entry of this._map) {
      yield entry.key;
    }
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

  /**
   * Creates a shallow copy of this set.
   */
  clone(): HashSet<T> {
    const clone = new HashSet<T>({ eq: this._eq });
    clone.addAll(this);
    return clone;
  }

  /**
   * Returns statistics about the underlying hash table.
   */
  getStats(): ReturnType<HashMap<T, symbol>["getStats"]> {
    return this._map.getStats();
  }

  /**
   * Returns a string representation for debugging.
   */
  toString(): string {
    return `HashSet{${this.toArray().join(", ")}}`;
  }
}

/**
 * Factory function to create a HashSet.
 *
 * @example
 * const set = hashSet<number>()
 * const setFromArray = hashSet([1, 2, 3, 2, 1]) // {1, 2, 3}
 * const setWithOptions = hashSet<string>({ initialCapacity: 32 })
 */
export function hashSet<T>(
  optionsOrElements?: HashSetOptions<T> | Iterable<T>
): HashSet<T> {
  // Check if it's an iterable (not options)
  if (optionsOrElements && Symbol.iterator in optionsOrElements) {
    const set = new HashSet<T>();
    set.addAll(optionsOrElements as Iterable<T>);
    return set;
  }

  return new HashSet<T>(optionsOrElements as HashSetOptions<T>);
}
