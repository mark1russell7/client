/**
 * Map interfaces that mirror Java's Map interface hierarchy.
 *
 * Maps store key-value pairs and provide efficient lookup by key.
 * Keys are unique within a map.
 */

import type { Eq, Compare } from "../core/traits.js";
import type { ReadonlyCollection } from "./collection.js";

/**
 * Entry<K, V> - An immutable key-value pair from a map.
 *
 * Unlike java.util.Map.Entry which has setValue(), our entries are immutable
 * snapshots. To update a value, use map.set(key, newValue) instead.
 *
 * This prevents accidental mutation and makes entries safe to share.
 */
export interface Entry<K, V> {
  readonly key: K;
  readonly value: V;
}

/**
 * ReadonlyMapLike<K, V> - Readonly key-value mapping.
 *
 * Provides read-only access to map operations.
 * Note: We use "MapLike" to avoid conflicts with TypeScript's built-in Map type.
 */
export interface ReadonlyMapLike<K, V> extends Iterable<Entry<K, V>> {
  /**
   * Returns the number of key-value pairs in this map.
   */
  readonly size: number;

  /**
   * Returns true if this map contains no key-value mappings.
   */
  readonly isEmpty: boolean;

  /**
   * Returns true if this map contains a mapping for the specified key.
   */
  has(key: K): boolean;

  /**
   * Returns the value to which the specified key is mapped.
   *
   * @throws Error if key is not present
   */
  get(key: K): V;

  /**
   * Returns the value for the key, or undefined if not present.
   */
  getOrUndefined(key: K): V | undefined;

  /**
   * Returns the value for the key, or the default value if not present.
   */
  getOrDefault(key: K, defaultValue: V): V;

  /**
   * Returns true if this map maps one or more keys to the specified value.
   */
  containsValue(value: V): boolean;

  /**
   * Returns an iterable view of the keys in this map.
   */
  keys(): Iterable<K>;

  /**
   * Returns an iterable view of the values in this map.
   */
  values(): Iterable<V>;

  /**
   * Returns an iterable view of the key-value pairs in this map.
   */
  entries(): Iterable<Entry<K, V>>;

  /**
   * Performs the given action for each key-value pair.
   */
  forEach(action: (value: V, key: K, map: this) => void): void;

  /**
   * Returns the equality function used for keys.
   */
  readonly keyEq: Eq<K>;

  /**
   * Returns the equality function used for values.
   */
  readonly valueEq: Eq<V>;
}

/**
 * MapLike<K, V> - Mutable key-value mapping.
 *
 * Mirrors java.util.Map.
 */
export interface MapLike<K, V> extends ReadonlyMapLike<K, V> {
  /**
   * Associates the specified value with the specified key in this map.
   * If the map previously contained a mapping for the key, the old value is replaced.
   *
   * @param key The key
   * @param value The value
   * @returns The previous value associated with key, or undefined if none
   */
  set(key: K, value: V): V | undefined;

  /**
   * Associates value with key only if key is not already present.
   *
   * @returns The current value (existing or newly set)
   */
  setIfAbsent(key: K, value: V): V;

  /**
   * Removes the mapping for a key if it is present.
   *
   * @returns The value that was associated with key, or undefined if none
   */
  delete(key: K): V | undefined;

  /**
   * Removes the entry for key only if currently mapped to the specified value.
   *
   * @returns true if the entry was removed
   */
  deleteEntry(key: K, value: V): boolean;

  /**
   * Replaces the entry for key only if currently mapped to some value.
   *
   * @returns The previous value, or undefined if key was not present
   */
  replace(key: K, value: V): V | undefined;

  /**
   * Replaces the entry for key only if currently mapped to the specified oldValue.
   *
   * @returns true if the value was replaced
   */
  replaceEntry(key: K, oldValue: V, newValue: V): boolean;

  /**
   * If the specified key is not already associated with a value,
   * computes its value using the given function and enters it into the map.
   *
   * @returns The current (existing or computed) value associated with the key
   */
  computeIfAbsent(key: K, mappingFunction: (key: K) => V): V;

  /**
   * If the value for the specified key is present, attempts to compute
   * a new mapping given the key and its current mapped value.
   *
   * @returns The new value associated with the key, or undefined if none
   */
  computeIfPresent(key: K, remappingFunction: (key: K, value: V) => V | undefined): V | undefined;

  /**
   * Attempts to compute a mapping for the specified key and its current mapped value.
   *
   * @returns The new value associated with the key, or undefined if none
   */
  compute(key: K, remappingFunction: (key: K, value: V | undefined) => V | undefined): V | undefined;

  /**
   * If the specified key is not already associated with a value or is
   * associated with undefined, associates it with the given non-undefined value.
   * Otherwise, replaces the value with the results of the given remapping function.
   *
   * @returns The new value associated with the key, or undefined if none
   */
  merge(key: K, value: V, remappingFunction: (oldValue: V, newValue: V) => V | undefined): V | undefined;

  /**
   * Copies all mappings from the specified map to this map.
   */
  putAll(other: ReadonlyMapLike<K, V> | Iterable<Entry<K, V>>): void;

  /**
   * Removes all mappings from this map.
   */
  clear(): void;
}

/**
 * SortedMap<K, V> - Map that maintains keys in sorted order.
 *
 * Mirrors java.util.SortedMap.
 */
export interface SortedMap<K, V> extends MapLike<K, V> {
  /**
   * Returns the comparison function used to order keys.
   */
  readonly comparator: Compare<K>;

  /**
   * Returns the first (lowest) key in this map.
   *
   * @throws Error if map is empty
   */
  firstKey(): K;

  /**
   * Returns the last (highest) key in this map.
   *
   * @throws Error if map is empty
   */
  lastKey(): K;

  /**
   * Returns a view of the portion of this map whose keys are less than toKey.
   */
  headMap(toKey: K): SortedMap<K, V>;

  /**
   * Returns a view of the portion of this map whose keys are greater than or equal to fromKey.
   */
  tailMap(fromKey: K): SortedMap<K, V>;

  /**
   * Returns a view of the portion of this map whose keys range from fromKey to toKey.
   */
  subMap(fromKey: K, toKey: K): SortedMap<K, V>;
}

/**
 * NavigableMap<K, V> - Extended sorted map with navigation methods.
 *
 * Mirrors java.util.NavigableMap.
 */
export interface NavigableMap<K, V> extends SortedMap<K, V> {
  /**
   * Returns the greatest key less than or equal to the given key, or undefined if none.
   */
  floorKey(key: K): K | undefined;

  /**
   * Returns the least key greater than or equal to the given key, or undefined if none.
   */
  ceilingKey(key: K): K | undefined;

  /**
   * Returns the greatest key strictly less than the given key, or undefined if none.
   */
  lowerKey(key: K): K | undefined;

  /**
   * Returns the least key strictly greater than the given key, or undefined if none.
   */
  higherKey(key: K): K | undefined;

  /**
   * Returns the entry for the greatest key less than or equal to the given key, or undefined.
   */
  floorEntry(key: K): Entry<K, V> | undefined;

  /**
   * Returns the entry for the least key greater than or equal to the given key, or undefined.
   */
  ceilingEntry(key: K): Entry<K, V> | undefined;

  /**
   * Returns the entry for the greatest key strictly less than the given key, or undefined.
   */
  lowerEntry(key: K): Entry<K, V> | undefined;

  /**
   * Returns the entry for the least key strictly greater than the given key, or undefined.
   */
  higherEntry(key: K): Entry<K, V> | undefined;

  /**
   * Returns the first (lowest) entry in this map, or undefined if empty.
   */
  firstEntry(): Entry<K, V> | undefined;

  /**
   * Returns the last (highest) entry in this map, or undefined if empty.
   */
  lastEntry(): Entry<K, V> | undefined;

  /**
   * Removes and returns the first (lowest) entry, or undefined if empty.
   */
  pollFirstEntry(): Entry<K, V> | undefined;

  /**
   * Removes and returns the last (highest) entry, or undefined if empty.
   */
  pollLastEntry(): Entry<K, V> | undefined;

  /**
   * Returns a reverse order view of this map.
   */
  descendingMap(): NavigableMap<K, V>;

  /**
   * Returns a reverse order iterable of the keys.
   */
  descendingKeys(): Iterable<K>;
}

/**
 * MultiMap<K, V> - Map that allows multiple values per key.
 *
 * Not in standard Java Collections, but commonly used.
 */
export interface MultiMap<K, V> {
  readonly size: number;
  readonly isEmpty: boolean;

  /**
   * Returns true if the map contains at least one value for the key.
   */
  has(key: K): boolean;

  /**
   * Returns all values associated with the key.
   */
  get(key: K): ReadonlyCollection<V>;

  /**
   * Adds a value to the collection of values for the key.
   */
  put(key: K, value: V): boolean;

  /**
   * Adds all values to the collection of values for the key.
   */
  putAll(key: K, values: Iterable<V>): boolean;

  /**
   * Removes a single occurrence of value from the key's collection.
   */
  remove(key: K, value: V): boolean;

  /**
   * Removes all values for the key.
   */
  removeAll(key: K): ReadonlyCollection<V>;

  /**
   * Replaces all values for the key with the given values.
   */
  replaceAll(key: K, values: Iterable<V>): ReadonlyCollection<V>;

  /**
   * Returns all keys that have at least one value.
   */
  keys(): Iterable<K>;

  /**
   * Returns all entries (key with one of its values).
   */
  entries(): Iterable<Entry<K, V>>;

  /**
   * Removes all mappings.
   */
  clear(): void;
}

/**
 * BiMap<K, V> - Bidirectional map (1:1 mapping).
 *
 * Both keys and values are unique.
 * Allows lookup by key or by value.
 */
export interface BiMap<K, V> extends MapLike<K, V> {
  /**
   * Returns the inverse view of this bimap (swaps keys and values).
   */
  inverse(): BiMap<V, K>;

  /**
   * Returns the key mapped to the specified value, or undefined if none.
   */
  getKey(value: V): K | undefined;

  /**
   * Forces the put by removing any existing entry with the same value.
   */
  forcePut(key: K, value: V): V | undefined;
}

/**
 * WeakMapLike<K extends object, V> - Map with weak key references.
 *
 * Mirrors JavaScript's WeakMap but with our interface conventions.
 * Keys must be objects and are held weakly (allow garbage collection).
 */
export interface WeakMapLike<K extends object, V> {
  has(key: K): boolean;
  get(key: K): V | undefined;
  set(key: K, value: V): this;
  delete(key: K): boolean;
}
