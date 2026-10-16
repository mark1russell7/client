/**
 * A map with a capacity, for the cache middleware.
 *
 * A JavaScript `Map` keeps its keys in the order of insertion. A read moves its key to the end,
 * so the first key is always the least recently used one. A write that goes over the capacity
 * removes the first key. The core has this small map itself, so it does not depend on
 * `@procedures/collections` (roadmap 3.3: before, the cache composed `lruMap` and
 * `hashMap` of that package).
 */
export class LruMap<K, V> {
  private readonly entries = new Map<K, V>();

  /**
   * @param capacity - The largest number of keys. A positive whole number.
   * @param onEvict - Called for each key that a write removes to keep the capacity.
   */
  constructor(
    private readonly capacity: number,
    private readonly onEvict?: (key: K, value: V) => void
  ) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`The capacity of an LRU map must be a positive whole number, not ${capacity}`);
    }
  }

  /** The number of keys. */
  get size(): number {
    return this.entries.size;
  }

  /** True when the map has the key. This does not count as a use. */
  has(key: K): boolean {
    return this.entries.has(key);
  }

  /** The value of the key, or undefined. A read makes the key the most recently used one. */
  get(key: K): V | undefined {
    if (!this.entries.has(key)) return undefined;
    const value = this.entries.get(key) as V;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  /** Set the value of a key, as the most recently used one. Over the capacity, the oldest key goes. */
  set(key: K, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value as K;
      const evicted = this.entries.get(oldest) as V;
      this.entries.delete(oldest);
      this.onEvict?.(oldest, evicted);
    }
  }

  /** Delete a key. True when it existed. */
  delete(key: K): boolean {
    return this.entries.delete(key);
  }

  /** Delete every key. */
  clear(): void {
    this.entries.clear();
  }

  /** Delete each key whose value matches. This does not count as a use. The number deleted. */
  deleteWhere(matches: (value: V, key: K) => boolean): number {
    let deleted = 0;
    for (const [key, value] of this.entries) {
      if (matches(value, key)) {
        this.entries.delete(key);
        deleted++;
      }
    }
    return deleted;
  }
}
