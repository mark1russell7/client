/**
 * LinkedHashMap - HashMap that maintains insertion order.
 *
 * Combines a hash table with a doubly-linked list to maintain predictable
 * iteration order. Mirrors java.util.LinkedHashMap.
 *
 * Key features:
 * - O(1) access, insert, delete (like HashMap)
 * - Predictable iteration order (insertion order or access order)
 * - Perfect for LRU caches when accessOrder is true
 *
 * @example
 * const map = linkedHashMap<string, number>()
 * map.set('a', 1)
 * map.set('b', 2)
 * map.set('c', 3)
 * // Iteration order: a, b, c (insertion order)
 *
 * @example
 * // LRU cache with access order
 * const lru = linkedHashMap<string, number>({ accessOrder: true })
 * lru.set('a', 1)
 * lru.set('b', 2)
 * lru.get('a') // Moves 'a' to end
 * // Iteration order: b, a (access order)
 */

import type { MapLike, Entry } from "../interfaces/map.js";
import type { Eq, Hash } from "../core/traits.js";
import { defaultEq, defaultHash } from "../utils/defaults.js";

/**
 * Node in the doubly-linked list.
 */
interface LinkedNode<K, V> {
  key: K;
  value: V;
  hash: number;
  prev: LinkedNode<K, V> | null;
  next: LinkedNode<K, V> | null;
}

/**
 * Options for creating a LinkedHashMap.
 */
export interface LinkedHashMapOptions<K, V> {
  /**
   * Initial capacity of the hash table.
   * @default 16
   */
  initialCapacity?: number;

  /**
   * Load factor before resizing.
   * @default 0.75
   */
  loadFactor?: number;

  /**
   * Equality function for keys.
   * @default defaultEq
   */
  eq?: Eq<K>;

  /**
   * Hash function for keys.
   * @default defaultHash
   */
  hash?: Hash<K>;

  /**
   * Equality function for values.
   * @default defaultEq
   */
  valueEq?: Eq<V>;

  /**
   * If true, maintain access order instead of insertion order.
   * Useful for LRU caches.
   * @default false
   */
  accessOrder?: boolean;
}

/**
 * LinkedHashMap<K, V> - Hash map with predictable iteration order.
 *
 * Maintains a doubly-linked list of entries to preserve insertion order
 * (or access order if accessOrder is true).
 */
export class LinkedHashMap<K, V> implements MapLike<K, V> {
  private _buckets: (LinkedNode<K, V> | null)[];
  private _size: number = 0;
  private readonly _loadFactor: number;
  private readonly _eq: Eq<K>;
  private readonly _hash: Hash<K>;
  private readonly _valueEq: Eq<V>;
  private readonly _accessOrder: boolean;

  // Doubly-linked list sentinels
  private _head: LinkedNode<K, V> | null = null;
  private _tail: LinkedNode<K, V> | null = null;

  constructor(options: LinkedHashMapOptions<K, V> = {}) {
    const {
      initialCapacity = 16,
      loadFactor = 0.75,
      eq = defaultEq,
      hash = defaultHash,
      valueEq = defaultEq,
      accessOrder = false,
    } = options;

    this._buckets = new Array(initialCapacity).fill(null);
    this._loadFactor = loadFactor;
    this._eq = eq;
    this._hash = hash;
    this._valueEq = valueEq;
    this._accessOrder = accessOrder;
  }

  // ========================================================================
  // Size and state
  // ========================================================================

  get size(): number {
    return this._size;
  }

  get isEmpty(): boolean {
    return this._size === 0;
  }

  get eq(): Eq<K> {
    return this._eq;
  }

  get keyEq(): Eq<K> {
    return this._eq;
  }

  get valueEq(): Eq<V> {
    return this._valueEq;
  }

  get hash(): Hash<K> {
    return this._hash;
  }

  // ========================================================================
  // Lookup operations
  // ========================================================================

  has(key: K): boolean {
    return this.getNode(key) !== null;
  }

  containsKey(key: K): boolean {
    return this.has(key);
  }

  containsValue(value: V): boolean {
    let node = this._head;
    while (node !== null) {
      if (this._valueEq(node.value, value)) {
        return true;
      }
      node = node.next;
    }
    return false;
  }

  get(key: K): V {
    const node = this.getNode(key);
    if (node === null) {
      throw new Error("Key not found");
    }
    if (this._accessOrder) {
      this.moveToEnd(node);
    }
    return node.value;
  }

  getOrUndefined(key: K): V | undefined {
    const node = this.getNode(key);
    if (node === null) return undefined;
    if (this._accessOrder) {
      this.moveToEnd(node);
    }
    return node.value;
  }

  getOrDefault(key: K, defaultValue: V): V {
    const node = this.getNode(key);
    if (node === null) return defaultValue;
    if (this._accessOrder) {
      this.moveToEnd(node);
    }
    return node.value;
  }

  // ========================================================================
  // Modification operations
  // ========================================================================

  set(key: K, value: V): V | undefined {
    const hashCode = this._hash(key);
    const index = this.getBucketIndex(hashCode);
    let node = this._buckets[index] ?? null;

    // Check if key already exists
    while (node !== null) {
      if (node.hash === hashCode && this._eq(node.key, key)) {
        const oldValue = node.value;
        node.value = value;
        if (this._accessOrder) {
          this.moveToEnd(node);
        }
        return oldValue;
      }
      node = node.next;
    }

    // Key doesn't exist, add new entry
    const newNode: LinkedNode<K, V> = {
      key,
      value,
      hash: hashCode,
      prev: null,
      next: this._buckets[index] ?? null,
    };

    this._buckets[index] = newNode;
    this._size++;

    // Add to linked list
    this.addToEnd(newNode);

    // Resize if needed
    if (this._size > this._buckets.length * this._loadFactor) {
      this.resize();
    }

    return undefined;
  }

  setIfAbsent(key: K, value: V): V {
    const existing = this.getNode(key);
    if (existing !== null) {
      if (this._accessOrder) {
        this.moveToEnd(existing);
      }
      return existing.value;
    }
    this.set(key, value);
    return value;
  }

  replace(key: K, value: V): V | undefined {
    const node = this.getNode(key);
    if (node === null) return undefined;
    const oldValue = node.value;
    node.value = value;
    if (this._accessOrder) {
      this.moveToEnd(node);
    }
    return oldValue;
  }

  replaceEntry(key: K, oldValue: V, newValue: V): boolean {
    const node = this.getNode(key);
    if (node === null || !this._valueEq(node.value, oldValue)) {
      return false;
    }
    node.value = newValue;
    if (this._accessOrder) {
      this.moveToEnd(node);
    }
    return true;
  }

  delete(key: K): V | undefined {
    const node = this.getNode(key);
    if (node === null) return undefined;

    const oldValue = node.value;

    // Remove from bucket
    this.removeFromBucket(node);

    // Remove from linked list
    this.removeFromList(node);

    this._size--;
    return oldValue;
  }

  deleteEntry(key: K, value: V): boolean {
    const node = this.getNode(key);
    if (node === null || !this._valueEq(node.value, value)) {
      return false;
    }

    // Remove from bucket
    this.removeFromBucket(node);

    // Remove from linked list
    this.removeFromList(node);

    this._size--;
    return true;
  }

  clear(): void {
    this._buckets = new Array(this._buckets.length).fill(null);
    this._size = 0;
    this._head = null;
    this._tail = null;
  }

  // ========================================================================
  // Bulk operations
  // ========================================================================

  putAll(other: MapLike<K, V> | Iterable<Entry<K, V>>): void {
    if ('entries' in other && typeof other.entries === 'function') {
      for (const entry of other.entries()) {
        this.set(entry.key, entry.value);
      }
    } else {
      for (const entry of other as Iterable<Entry<K, V>>) {
        this.set(entry.key, entry.value);
      }
    }
  }

  // ========================================================================
  // Computed operations
  // ========================================================================

  computeIfAbsent(key: K, mappingFunction: (key: K) => V): V {
    const existing = this.getNode(key);
    if (existing !== null) {
      if (this._accessOrder) {
        this.moveToEnd(existing);
      }
      return existing.value;
    }
    const value = mappingFunction(key);
    this.set(key, value);
    return value;
  }

  computeIfPresent(key: K, remappingFunction: (key: K, value: V) => V | undefined): V | undefined {
    const existing = this.getNode(key);
    if (existing === null) return undefined;

    const newValue = remappingFunction(key, existing.value);
    if (newValue === undefined) {
      this.delete(key);
      return undefined;
    }
    existing.value = newValue;
    if (this._accessOrder) {
      this.moveToEnd(existing);
    }
    return newValue;
  }

  compute(key: K, remappingFunction: (key: K, value: V | undefined) => V | undefined): V | undefined {
    const existing = this.getNode(key);
    const newValue = remappingFunction(key, existing?.value);

    if (newValue === undefined) {
      if (existing !== null) {
        this.delete(key);
      }
      return undefined;
    }

    this.set(key, newValue);
    return newValue;
  }

  merge(key: K, value: V, remappingFunction: (oldValue: V, newValue: V) => V | undefined): V | undefined {
    const existing = this.getNode(key);

    if (existing === null) {
      this.set(key, value);
      return value;
    }

    const merged = remappingFunction(existing.value, value);
    if (merged === undefined) {
      this.delete(key);
      return undefined;
    }

    existing.value = merged;
    if (this._accessOrder) {
      this.moveToEnd(existing);
    }
    return merged;
  }

  // ========================================================================
  // View operations
  // ========================================================================

  *keys(): IterableIterator<K> {
    let node = this._head;
    while (node !== null) {
      yield node.key;
      node = node.next;
    }
  }

  *values(): IterableIterator<V> {
    let node = this._head;
    while (node !== null) {
      yield node.value;
      node = node.next;
    }
  }

  *entries(): IterableIterator<Entry<K, V>> {
    let node = this._head;
    while (node !== null) {
      yield { key: node.key, value: node.value };
      node = node.next;
    }
  }

  *[Symbol.iterator](): Iterator<Entry<K, V>> {
    yield* this.entries();
  }

  forEach(action: (value: V, key: K, map: this) => void): void {
    for (const entry of this.entries()) {
      action(entry.value, entry.key, this);
    }
  }

  toArray(): Entry<K, V>[] {
    return Array.from(this.entries());
  }

  // ========================================================================
  // Private helpers
  // ========================================================================

  private getNode(key: K): LinkedNode<K, V> | null {
    const hashCode = this._hash(key);
    const index = this.getBucketIndex(hashCode);
    let node = this._buckets[index] ?? null;

    while (node !== null) {
      if (node.hash === hashCode && this._eq(node.key, key)) {
        return node;
      }
      node = node.next;
    }

    return null;
  }

  private getBucketIndex(hashCode: number): number {
    return Math.abs(hashCode) % this._buckets.length;
  }

  private removeFromBucket(node: LinkedNode<K, V>): void {
    const index = this.getBucketIndex(node.hash);
    let current = this._buckets[index] ?? null;
    let prev: LinkedNode<K, V> | null = null;

    while (current !== null) {
      if (current === node) {
        if (prev === null) {
          this._buckets[index] = current.next;
        } else {
          prev.next = current.next;
        }
        return;
      }
      prev = current;
      current = current.next;
    }
  }

  private addToEnd(node: LinkedNode<K, V>): void {
    if (this._tail === null) {
      // First node
      this._head = node;
      this._tail = node;
      node.prev = null;
      node.next = null;
    } else {
      // Append to end
      this._tail.next = node;
      node.prev = this._tail;
      node.next = null;
      this._tail = node;
    }
  }

  private removeFromList(node: LinkedNode<K, V>): void {
    if (node.prev !== null) {
      node.prev.next = node.next;
    } else {
      this._head = node.next;
    }

    if (node.next !== null) {
      node.next.prev = node.prev;
    } else {
      this._tail = node.prev;
    }
  }

  private moveToEnd(node: LinkedNode<K, V>): void {
    if (node === this._tail) return; // Already at end

    // Remove from current position
    if (node.prev !== null) {
      node.prev.next = node.next;
    } else {
      this._head = node.next;
    }

    if (node.next !== null) {
      node.next.prev = node.prev;
    }

    // Add to end
    if (this._tail !== null) {
      this._tail.next = node;
    }
    node.prev = this._tail;
    node.next = null;
    this._tail = node;

    if (this._head === null) {
      this._head = node;
    }
  }

  private resize(): void {
    const oldBuckets = this._buckets;
    this._buckets = new Array(oldBuckets.length * 2).fill(null);

    // Rehash all entries
    let node = this._head;
    while (node !== null) {
      const index = this.getBucketIndex(node.hash);
      node.next = this._buckets[index] ?? null;
      this._buckets[index] = node;
      node = node.next;
    }
  }

  // ========================================================================
  // Utility methods
  // ========================================================================

  toString(): string {
    const entries = Array.from(this.entries())
      .map(({ key, value }) => `${key}=${value}`)
      .join(', ');
    return `LinkedHashMap{${entries}}`;
  }
}

/**
 * Factory function to create a LinkedHashMap.
 *
 * @example
 * const map = linkedHashMap<string, number>()
 * map.set('a', 1)
 * map.set('b', 2)
 *
 * @example
 * // With initial entries
 * const map = linkedHashMap<string, number>([
 *   ['a', 1],
 *   ['b', 2]
 * ])
 *
 * @example
 * // LRU cache with access order
 * const lru = linkedHashMap<string, number>({ accessOrder: true })
 */
export function linkedHashMap<K, V>(
  optionsOrEntries?: LinkedHashMapOptions<K, V> | Iterable<[K, V]>
): LinkedHashMap<K, V> {
  if (optionsOrEntries && Symbol.iterator in optionsOrEntries) {
    const map = new LinkedHashMap<K, V>();
    for (const [key, value] of optionsOrEntries as Iterable<[K, V]>) {
      map.set(key, value);
    }
    return map;
  }

  return new LinkedHashMap<K, V>(optionsOrEntries as LinkedHashMapOptions<K, V>);
}
