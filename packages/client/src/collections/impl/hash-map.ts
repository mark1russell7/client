/**
 * HashMap implementation - A hash table with custom equality and hashing.
 *
 * Provides O(1) average case lookup, insertion, and deletion.
 * Supports custom equality and hash functions for keys.
 * Mirrors java.util.HashMap.
 *
 * @example
 * const map = hashMap<string, number>()
 * map.set('one', 1)
 * map.set('two', 2)
 * console.log(map.get('one')) // 1
 *
 * // Custom equality for object keys
 * const userMap = hashMap<User, Data>({
 *   keyEq: (a, b) => a.id === b.id,
 *   keyHash: (u) => hashString(u.id)
 * })
 */

import type { MapLike, Entry } from "../interfaces/map.js";
import type { Eq, Hash } from "../core/traits.js";
import { defaultEq, defaultHash } from "../utils/defaults.js";

/**
 * Internal entry node for hash buckets.
 */
interface Node<K, V> {
  key: K;
  value: V;
  hash: number;
  next: Node<K, V> | null;
}

/**
 * Options for creating a HashMap.
 */
export interface HashMapOptions<K, V> {
  /**
   * Initial capacity (number of buckets).
   * Must be a power of 2.
   * @default 16
   */
  initialCapacity?: number;

  /**
   * Load factor threshold for resizing (0-1).
   * When size > capacity * loadFactor, the map resizes.
   * @default 0.75
   */
  loadFactor?: number;

  /**
   * Equality function for keys.
   * @default defaultEq (===)
   */
  keyEq?: Eq<K>;

  /**
   * Hash function for keys.
   * @default defaultHash
   */
  keyHash?: Hash<K>;

  /**
   * Equality function for values (used in containsValue).
   * @default defaultEq (===)
   */
  valueEq?: Eq<V>;
}

/**
 * HashMap<K, V> - Hash table implementation with custom equality/hashing.
 *
 * Uses separate chaining for collision resolution.
 * Automatically resizes when load factor is exceeded.
 *
 * Not thread-safe. Use synchronized() behavior for concurrent access.
 */
export class HashMap<K, V> implements MapLike<K, V> {
  private _buckets: (Node<K, V> | null)[];
  private _size: number;
  private readonly _loadFactor: number;
  private readonly _keyEq: Eq<K>;
  private readonly _keyHash: Hash<K>;
  private readonly _valueEq: Eq<V>;
  private _threshold: number;

  constructor(options: HashMapOptions<K, V> = {}) {
    const {
      initialCapacity = 16,
      loadFactor = 0.75,
      keyEq = defaultEq,
      keyHash = defaultHash,
      valueEq = defaultEq,
    } = options;

    const capacity = this.nextPowerOfTwo(Math.max(4, initialCapacity));
    this._buckets = new Array(capacity).fill(null);
    this._size = 0;
    this._loadFactor = loadFactor;
    this._keyEq = keyEq;
    this._keyHash = keyHash;
    this._valueEq = valueEq;
    this._threshold = Math.floor(capacity * loadFactor);
  }

  // ========================================================================
  // Size
  // ========================================================================

  get size(): number {
    return this._size;
  }

  get isEmpty(): boolean {
    return this._size === 0;
  }

  get keyEq(): Eq<K> {
    return this._keyEq;
  }

  get valueEq(): Eq<V> {
    return this._valueEq;
  }

  // ========================================================================
  // Lookup
  // ========================================================================

  has(key: K): boolean {
    const hash = this._keyHash(key);
    const index = this.bucketIndex(hash);
    let node = this._buckets[index] ?? null;

    while (node !== null) {
      if (node.hash === hash && this._keyEq(node.key, key)) {
        return true;
      }
      node = node.next;
    }

    return false;
  }

  get(key: K): V {
    const value = this.getOrUndefined(key);
    if (value === undefined) {
      throw new Error(`Key not found: ${key}`);
    }
    return value;
  }

  getOrUndefined(key: K): V | undefined {
    const hash = this._keyHash(key);
    const index = this.bucketIndex(hash);
    let node = this._buckets[index] ?? null;

    while (node !== null) {
      if (node.hash === hash && this._keyEq(node.key, key)) {
        return node.value;
      }
      node = node.next;
    }

    return undefined;
  }

  getOrDefault(key: K, defaultValue: V): V {
    const value = this.getOrUndefined(key);
    return value !== undefined ? value : defaultValue;
  }

  containsValue(value: V): boolean {
    for (const bucket of this._buckets) {
      let node = bucket;
      while (node !== null) {
        if (this._valueEq(node.value, value)) {
          return true;
        }
        node = node.next;
      }
    }
    return false;
  }

  // ========================================================================
  // Modification
  // ========================================================================

  set(key: K, value: V): V | undefined {
    const hash = this._keyHash(key);
    const index = this.bucketIndex(hash);
    let node = this._buckets[index] ?? null;

    // Check if key already exists
    while (node !== null) {
      if (node.hash === hash && this._keyEq(node.key, key)) {
        const oldValue = node.value;
        node.value = value;
        return oldValue;
      }
      node = node.next;
    }

    // Key doesn't exist, add new entry
    const newNode: Node<K, V> = {
      key,
      value,
      hash,
      next: this._buckets[index] ?? null,
    };
    this._buckets[index] = newNode;
    this._size++;

    // Check if resize is needed
    if (this._size > this._threshold) {
      this.resize();
    }

    return undefined;
  }

  setIfAbsent(key: K, value: V): V {
    const existing = this.getOrUndefined(key);
    if (existing !== undefined) {
      return existing;
    }
    this.set(key, value);
    return value;
  }

  delete(key: K): V | undefined {
    const hash = this._keyHash(key);
    const index = this.bucketIndex(hash);
    let node = this._buckets[index] ?? null;
    let prev: Node<K, V> | null = null;

    while (node !== null) {
      if (node.hash === hash && this._keyEq(node.key, key)) {
        // Found the node to delete
        if (prev === null) {
          // Node is at head of bucket
          this._buckets[index] = node.next;
        } else {
          // Node is in middle or end
          prev.next = node.next;
        }
        this._size--;
        return node.value;
      }
      prev = node;
      node = node.next;
    }

    return undefined;
  }

  deleteEntry(key: K, value: V): boolean {
    const hash = this._keyHash(key);
    const index = this.bucketIndex(hash);
    let node = this._buckets[index] ?? null;
    let prev: Node<K, V> | null = null;

    while (node !== null) {
      if (
        node.hash === hash &&
        this._keyEq(node.key, key) &&
        this._valueEq(node.value, value)
      ) {
        // Found the entry to delete
        if (prev === null) {
          this._buckets[index] = node.next;
        } else {
          prev.next = node.next;
        }
        this._size--;
        return true;
      }
      prev = node;
      node = node.next;
    }

    return false;
  }

  replace(key: K, value: V): V | undefined {
    const hash = this._keyHash(key);
    const index = this.bucketIndex(hash);
    let node = this._buckets[index] ?? null;

    while (node !== null) {
      if (node.hash === hash && this._keyEq(node.key, key)) {
        const oldValue = node.value;
        node.value = value;
        return oldValue;
      }
      node = node.next;
    }

    return undefined;
  }

  replaceEntry(key: K, oldValue: V, newValue: V): boolean {
    const hash = this._keyHash(key);
    const index = this.bucketIndex(hash);
    let node = this._buckets[index] ?? null;

    while (node !== null) {
      if (
        node.hash === hash &&
        this._keyEq(node.key, key) &&
        this._valueEq(node.value, oldValue)
      ) {
        node.value = newValue;
        return true;
      }
      node = node.next;
    }

    return false;
  }

  // ========================================================================
  // Compute operations
  // ========================================================================

  computeIfAbsent(key: K, mappingFunction: (key: K) => V): V {
    const existing = this.getOrUndefined(key);
    if (existing !== undefined) {
      return existing;
    }

    const newValue = mappingFunction(key);
    this.set(key, newValue);
    return newValue;
  }

  computeIfPresent(
    key: K,
    remappingFunction: (key: K, value: V) => V | undefined
  ): V | undefined {
    const existing = this.getOrUndefined(key);
    if (existing === undefined) {
      return undefined;
    }

    const newValue = remappingFunction(key, existing);
    if (newValue === undefined) {
      this.delete(key);
      return undefined;
    }

    this.set(key, newValue);
    return newValue;
  }

  compute(
    key: K,
    remappingFunction: (key: K, value: V | undefined) => V | undefined
  ): V | undefined {
    const existing = this.getOrUndefined(key);
    const newValue = remappingFunction(key, existing);

    if (newValue === undefined) {
      if (existing !== undefined) {
        this.delete(key);
      }
      return undefined;
    }

    this.set(key, newValue);
    return newValue;
  }

  merge(
    key: K,
    value: V,
    remappingFunction: (oldValue: V, newValue: V) => V | undefined
  ): V | undefined {
    const existing = this.getOrUndefined(key);

    if (existing === undefined) {
      this.set(key, value);
      return value;
    }

    const merged = remappingFunction(existing, value);
    if (merged === undefined) {
      this.delete(key);
      return undefined;
    }

    this.set(key, merged);
    return merged;
  }

  // ========================================================================
  // Bulk operations
  // ========================================================================

  putAll(other: MapLike<K, V> | Iterable<Entry<K, V>>): void {
    for (const entry of other) {
      this.set(entry.key, entry.value);
    }
  }

  clear(): void {
    this._buckets.fill(null);
    this._size = 0;
  }

  // ========================================================================
  // Views
  // ========================================================================

  *keys(): IterableIterator<K> {
    for (const bucket of this._buckets) {
      let node = bucket;
      while (node !== null) {
        yield node.key;
        node = node.next;
      }
    }
  }

  *values(): IterableIterator<V> {
    for (const bucket of this._buckets) {
      let node = bucket;
      while (node !== null) {
        yield node.value;
        node = node.next;
      }
    }
  }

  *entries(): IterableIterator<Entry<K, V>> {
    for (const bucket of this._buckets) {
      let node = bucket;
      while (node !== null) {
        yield { key: node.key, value: node.value };
        node = node.next;
      }
    }
  }

  // ========================================================================
  // Iteration
  // ========================================================================

  *[Symbol.iterator](): Iterator<Entry<K, V>> {
    yield* this.entries();
  }

  forEach(action: (value: V, key: K, map: this) => void): void {
    for (const entry of this.entries()) {
      action(entry.value, entry.key, this);
    }
  }

  // ========================================================================
  // Internal helpers
  // ========================================================================

  /**
   * Returns the bucket index for a given hash.
   */
  private bucketIndex(hash: number): number {
    // Use bitwise AND with (length - 1) for efficient modulo
    // This works because length is always a power of 2
    return hash & (this._buckets.length - 1);
  }

  /**
   * Resizes the hash table to double its current capacity.
   */
  private resize(): void {
    const oldBuckets = this._buckets;
    const newCapacity = oldBuckets.length << 1; // Double capacity

    if (newCapacity < 0) {
      throw new Error("Map too large");
    }

    this._buckets = new Array(newCapacity).fill(null);
    this._threshold = Math.floor(newCapacity * this._loadFactor);

    // Rehash all entries
    for (const bucket of oldBuckets) {
      let node = bucket;
      while (node !== null) {
        const next = node.next;
        const index = this.bucketIndex(node.hash);
        node.next = this._buckets[index] ?? null;
        this._buckets[index] = node;
        node = next;
      }
    }
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
   * Returns the current number of buckets.
   */
  get capacity(): number {
    return this._buckets.length;
  }

  /**
   * Returns the current load factor (size / capacity).
   */
  get loadFactor(): number {
    return this._size / this._buckets.length;
  }

  /**
   * Returns statistics about bucket distribution (for debugging).
   */
  getStats(): {
    size: number;
    capacity: number;
    loadFactor: number;
    avgChainLength: number;
    maxChainLength: number;
    emptyBuckets: number;
  } {
    let maxChainLength = 0;
    let totalChainLength = 0;
    let emptyBuckets = 0;

    for (const bucket of this._buckets) {
      if (bucket === null) {
        emptyBuckets++;
      } else {
        let length = 0;
        let node: Node<K, V> | null = bucket;
        while (node !== null) {
          length++;
          node = node.next;
        }
        totalChainLength += length;
        maxChainLength = Math.max(maxChainLength, length);
      }
    }

    return {
      size: this._size,
      capacity: this._buckets.length,
      loadFactor: this.loadFactor,
      avgChainLength: this._size > 0 ? totalChainLength / (this._buckets.length - emptyBuckets) : 0,
      maxChainLength,
      emptyBuckets,
    };
  }
}

/**
 * Factory function to create a HashMap.
 *
 * @example
 * const map = hashMap<string, number>()
 * const mapWithOptions = hashMap<User, Data>({
 *   keyEq: (a, b) => a.id === b.id,
 *   keyHash: (u) => hashString(u.id)
 * })
 * const mapFromEntries = hashMap([['a', 1], ['b', 2]])
 */
export function hashMap<K, V>(
  optionsOrEntries?: HashMapOptions<K, V> | Iterable<readonly [K, V]>
): HashMap<K, V> {
  // Check if it's an iterable of entries
  if (optionsOrEntries && Symbol.iterator in optionsOrEntries) {
    const map = new HashMap<K, V>();
    for (const [key, value] of optionsOrEntries as Iterable<readonly [K, V]>) {
      map.set(key, value);
    }
    return map;
  }

  return new HashMap<K, V>(optionsOrEntries as HashMapOptions<K, V>);
}
