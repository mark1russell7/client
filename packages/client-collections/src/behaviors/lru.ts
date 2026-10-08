/**
 * LRU (Least Recently Used) eviction behavior.
 *
 * Tracks access times and automatically evicts the least recently used
 * elements when capacity is reached. Perfect for caching.
 *
 * @example
 * const cache = compose(
 *   lruMap({ capacity: 100 })
 * )(hashMap<string, Data>())
 *
 * cache.set('key1', data1) // Accessed
 * cache.get('key1')        // Accessed again (moves to front)
 * // When full, least recently accessed keys are evicted
 */

import type { Middleware } from "../core/middleware.js";
import type { MapLike } from "../interfaces/map.js";
import { compositeMapMethod } from "./composite.js";

/**
 * Options for LRU behavior.
 */
export interface LRUOptions {
  /**
   * Maximum capacity. When exceeded, least recently used items are evicted.
   */
  capacity: number;

  /**
   * Optional callback invoked when an item is evicted.
   */
  onEvict?: (info: { key: any; value: any; timestamp: number }) => void;
}

/**
 * Metadata for tracking LRU access.
 */
interface LRUNode<K, V> {
  key: K;
  value: V;
  lastAccessed: number;
  prev: LRUNode<K, V> | null;
  next: LRUNode<K, V> | null;
}

/**
 * Creates an LRU Map middleware.
 *
 * Maintains a doubly-linked list to track access order.
 * Most recently accessed items are at the head.
 * When capacity is exceeded, items at the tail are evicted.
 */
export function lruMap<K, V>(
  options: LRUOptions
): Middleware<MapLike<K, V> & { readonly isFull: boolean }> {
  const { capacity, onEvict } = options;

  return (next: MapLike<K, V>): MapLike<K, V> & { readonly isFull: boolean } => {
    // Doubly-linked list for LRU tracking
    let head: LRUNode<K, V> | null = null;
    let tail: LRUNode<K, V> | null = null;
    const nodeMap = new Map<K, LRUNode<K, V>>();

    const moveToHead = (node: LRUNode<K, V>): void => {
      // Remove from current position
      if (node.prev) {
        node.prev.next = node.next;
      } else {
        head = node.next;
      }

      if (node.next) {
        node.next.prev = node.prev;
      } else {
        tail = node.prev;
      }

      // Add to head
      node.prev = null;
      node.next = head;
      if (head) {
        head.prev = node;
      }
      head = node;

      if (!tail) {
        tail = node;
      }

      node.lastAccessed = Date.now();
    };

    const addNode = (key: K, value: V): void => {
      const node: LRUNode<K, V> = {
        key,
        value,
        lastAccessed: Date.now(),
        prev: null,
        next: head,
      };

      if (head) {
        head.prev = node;
      }
      head = node;

      if (!tail) {
        tail = node;
      }

      nodeMap.set(key, node);
    };

    const removeNode = (node: LRUNode<K, V>): void => {
      if (node.prev) {
        node.prev.next = node.next;
      } else {
        head = node.next;
      }

      if (node.next) {
        node.next.prev = node.prev;
      } else {
        tail = node.prev;
      }

      nodeMap.delete(node.key);
    };

    // A layer below this one (for example ttlMap, in compose(lruMap, ttlMap)) can remove an
    // entry without this layer seeing it. Its node is then stale: the list must not keep it
    // (it holds the value, and it would grow without bound) and evicting it is not an eviction.
    const dropStaleNodes = (): void => {
      for (const node of [...nodeMap.values()]) {
        if (!next.has(node.key)) {
          removeNode(node);
        }
      }
    };

    const evictLRU = (): void => {
      while (tail) {
        const candidate = tail;
        removeNode(candidate);
        if (!next.has(candidate.key)) {
          // Already removed below: skip it and evict the next least recently used entry
          continue;
        }
        next.delete(candidate.key);

        if (onEvict) {
          onEvict({
            key: candidate.key,
            value: candidate.value,
            timestamp: candidate.lastAccessed,
          });
        }
        return;
      }
    };

    return new Proxy(next, {
      get(target, prop, receiver) {
        // Add isFull property
        if (prop === "isFull") {
          return target.size >= capacity;
        }

        // Composite methods (setIfAbsent, compute, merge, putAll and others) go through this
        // proxy's own primitives, so they keep this behavior's rules (BUGS-2026-07 L13)
        const composite = compositeMapMethod(receiver as MapLike<K, V>, prop);
        if (composite) {
          return composite;
        }

        const value = Reflect.get(target, prop, receiver);

        if (typeof value === "function") {
          switch (prop) {
            case "get":
              return function (key: K): V {
                let result: V;
                try {
                  result = (value as Function).call(target, key);
                } catch (error) {
                  // The entry is gone below (for example expired): forget its node
                  const stale = nodeMap.get(key);
                  if (stale) {
                    removeNode(stale);
                  }
                  throw error;
                }
                // Update access time
                const node = nodeMap.get(key);
                if (node) {
                  moveToHead(node);
                }
                return result;
              };

            case "has":
              return function (key: K): boolean {
                const result = (value as Function).call(target, key);
                const node = nodeMap.get(key);
                if (node) {
                  if (result) {
                    // Update access time
                    moveToHead(node);
                  } else {
                    // The entry is gone below (for example expired): forget its node
                    removeNode(node);
                  }
                }
                return result;
              };

            case "set":
              return function (key: K, val: V): V | undefined {
                const hadKey = target.has(key);

                if (hadKey) {
                  // Update existing
                  const oldValue = (value as Function).call(target, key, val);
                  const node = nodeMap.get(key);
                  if (node) {
                    node.value = val;
                    moveToHead(node);
                  }
                  return oldValue;
                } else {
                  // Add new. A stale node for this key (its entry was removed below) must not
                  // stay in the list: evicting it later would delete the new node's map entry.
                  const stale = nodeMap.get(key);
                  if (stale) {
                    removeNode(stale);
                  }
                  // Keep the node list bounded: when it reaches capacity, drop stale nodes first
                  if (nodeMap.size >= capacity) {
                    dropStaleNodes();
                  }
                  if (target.size >= capacity) {
                    evictLRU();
                  }
                  const result = (value as Function).call(target, key, val);
                  addNode(key, val);
                  return result;
                }
              };

            case "delete":
              return function (key: K): V | undefined {
                const result = (value as Function).call(target, key);
                const node = nodeMap.get(key);
                if (node) {
                  removeNode(node);
                }
                return result;
              };

            case "clear":
              return function (): void {
                (value as Function).call(target);
                head = null;
                tail = null;
                nodeMap.clear();
              };
          }
        }

        return value;
      },
    }) as MapLike<K, V> & { readonly isFull: boolean };
  };
}

/**
 * Creates an LRU cache with a simpler API.
 * This is a standalone LRU cache implementation.
 *
 * @example
 * const cache = lruCache<string, Data>(100)
 * cache.set('key', value)
 * cache.get('key') // Moves to front
 */
export class LRUCache<K, V> {
  private map: Map<K, { value: V; node: LRUNode<K, V> }> = new Map();
  private head: LRUNode<K, V> | null = null;
  private tail: LRUNode<K, V> | null = null;

  constructor(
    private readonly capacity: number,
    private readonly onEvict?: (key: K, value: V) => void
  ) {}

  get size(): number {
    return this.map.size;
  }

  get isFull(): boolean {
    return this.map.size >= this.capacity;
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;

    this.moveToHead(entry.node);
    return entry.value;
  }

  set(key: K, value: V): void {
    const entry = this.map.get(key);

    if (entry) {
      // Update existing
      entry.value = value;
      entry.node.value = value;
      this.moveToHead(entry.node);
    } else {
      // Add new
      if (this.map.size >= this.capacity) {
        this.evictLRU();
      }

      const node: LRUNode<K, V> = {
        key,
        value,
        lastAccessed: Date.now(),
        prev: null,
        next: this.head,
      };

      if (this.head) {
        this.head.prev = node;
      }
      this.head = node;

      if (!this.tail) {
        this.tail = node;
      }

      this.map.set(key, { value, node });
    }
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  delete(key: K): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;

    this.removeNode(entry.node);
    this.map.delete(key);
    return true;
  }

  clear(): void {
    this.map.clear();
    this.head = null;
    this.tail = null;
  }

  private moveToHead(node: LRUNode<K, V>): void {
    if (node === this.head) return;

    // Remove from current position
    if (node.prev) {
      node.prev.next = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }

    // Add to head
    node.prev = null;
    node.next = this.head;
    if (this.head) {
      this.head.prev = node;
    }
    this.head = node;

    node.lastAccessed = Date.now();
  }

  private removeNode(node: LRUNode<K, V>): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
  }

  private evictLRU(): void {
    if (!this.tail) return;

    const evicted = this.tail;
    this.removeNode(evicted);
    this.map.delete(evicted.key);

    if (this.onEvict) {
      this.onEvict(evicted.key, evicted.value);
    }
  }

  /**
   * Returns keys in LRU order (most recent first).
   */
  *keys(): IterableIterator<K> {
    let node = this.head;
    while (node) {
      yield node.key;
      node = node.next;
    }
  }

  /**
   * Returns entries in LRU order (most recent first).
   */
  *entries(): IterableIterator<[K, V]> {
    let node = this.head;
    while (node) {
      yield [node.key, node.value];
      node = node.next;
    }
  }
}

/**
 * Factory function to create an LRU cache.
 */
export function lruCache<K, V>(
  capacity: number,
  onEvict?: (key: K, value: V) => void
): LRUCache<K, V> {
  return new LRUCache(capacity, onEvict);
}
