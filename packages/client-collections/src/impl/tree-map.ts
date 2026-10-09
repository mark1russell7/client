/**
 * TreeMap - Red-black tree based sorted map implementation.
 *
 * Implements a self-balancing binary search tree that maintains keys in sorted
 * order. Mirrors java.util.TreeMap.
 *
 * Key features:
 * - O(log n) access, insert, delete
 * - Keys maintained in sorted order (natural or custom comparator)
 * - Navigation methods (floor, ceiling, lower, higher)
 * - Range view operations (subMap, headMap, tailMap)
 *
 * @example
 * const map = treeMap<string, number>()
 * map.set('c', 3)
 * map.set('a', 1)
 * map.set('b', 2)
 * // Iteration order: a, b, c (sorted)
 *
 * @example
 * // Custom comparator for descending order
 * const map = treeMap<number, string>({
 *   compare: (a, b) => b - a
 * })
 */

import type { NavigableMap, SortedMap, Entry } from "../interfaces/map.js";
import type { Eq, Compare } from "../core/traits.js";
import { defaultEq, defaultCompare } from "../utils/defaults.js";

/**
 * Node color in red-black tree.
 */
enum Color {
  RED = "RED",
  BLACK = "BLACK",
}

/**
 * Node in the red-black tree.
 */
interface TreeNode<K, V> {
  key: K;
  value: V;
  color: Color;
  left: TreeNode<K, V> | null;
  right: TreeNode<K, V> | null;
  parent: TreeNode<K, V> | null;
}

// Null-safe helpers of the red-black algorithms: a null leaf is black
function colorOf<K, V>(node: TreeNode<K, V> | null): Color {
  return node === null ? Color.BLACK : node.color;
}
function parentOf<K, V>(node: TreeNode<K, V> | null): TreeNode<K, V> | null {
  return node === null ? null : node.parent;
}
function leftOf<K, V>(node: TreeNode<K, V> | null): TreeNode<K, V> | null {
  return node === null ? null : node.left;
}
function rightOf<K, V>(node: TreeNode<K, V> | null): TreeNode<K, V> | null {
  return node === null ? null : node.right;
}
function setColor<K, V>(node: TreeNode<K, V> | null, color: Color): void {
  if (node !== null) node.color = color;
}

/**
 * Options for creating a TreeMap.
 */
export interface TreeMapOptions<K, V> {
  /**
   * Comparison function for keys.
   * @default defaultCompare
   */
  compare?: Compare<K>;

  /**
   * Equality function for keys.
   * @default defaultEq
   */
  eq?: Eq<K>;

  /**
   * Equality function for values.
   * @default defaultEq
   */
  valueEq?: Eq<V>;
}

/**
 * TreeMap<K, V> - Red-black tree based sorted map.
 *
 * Maintains keys in sorted order using a self-balancing binary search tree.
 * Provides O(log n) operations and navigation methods.
 */
export class TreeMap<K, V> implements NavigableMap<K, V> {
  private _root: TreeNode<K, V> | null = null;
  private _size: number = 0;
  private readonly _compare: Compare<K>;
  private readonly _eq: Eq<K>;
  private readonly _valueEq: Eq<V>;

  constructor(options: TreeMapOptions<K, V> = {}) {
    const {
      compare = defaultCompare,
      eq = defaultEq,
      valueEq = defaultEq,
    } = options;

    this._compare = compare;
    this._eq = eq;
    this._valueEq = valueEq;
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

  get comparator(): Compare<K> {
    return this._compare;
  }

  get keyEq(): Eq<K> {
    return this._eq;
  }

  get valueEq(): Eq<V> {
    return this._valueEq;
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
    return this.findValue(this._root, value);
  }

  get(key: K): V {
    const node = this.getNode(key);
    if (node === null) {
      throw new Error("Key not found");
    }
    return node.value;
  }

  getOrUndefined(key: K): V | undefined {
    const node = this.getNode(key);
    return node?.value;
  }

  getOrDefault(key: K, defaultValue: V): V {
    const node = this.getNode(key);
    return node !== null ? node.value : defaultValue;
  }

  // ========================================================================
  // Modification operations
  // ========================================================================

  set(key: K, value: V): V | undefined {
    if (this._root === null) {
      this._root = this.createNode(key, value, Color.BLACK);
      this._size++;
      return undefined;
    }

    // Find insertion point
    let node: TreeNode<K, V> | null = this._root;
    let parent: TreeNode<K, V> | null = null;

    while (node !== null) {
      parent = node;
      const cmp = this._compare(key, node.key);

      if (cmp === 0) {
        // Key exists, replace value
        const oldValue = node.value;
        node.value = value;
        return oldValue;
      } else if (cmp < 0) {
        node = node.left;
      } else {
        node = node.right;
      }
    }

    // Insert new node
    const newNode = this.createNode(key, value, Color.RED);
    newNode.parent = parent;

    if (parent !== null) {
      const cmp = this._compare(key, parent.key);
      if (cmp < 0) {
        parent.left = newNode;
      } else {
        parent.right = newNode;
      }
    }

    this._size++;
    this.fixAfterInsertion(newNode);
    return undefined;
  }

  setIfAbsent(key: K, value: V): V {
    const existing = this.getNode(key);
    if (existing !== null) {
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
    return oldValue;
  }

  replaceEntry(key: K, oldValue: V, newValue: V): boolean {
    const node = this.getNode(key);
    if (node === null || !this._valueEq(node.value, oldValue)) {
      return false;
    }
    node.value = newValue;
    return true;
  }

  delete(key: K): V | undefined {
    const node = this.getNode(key);
    if (node === null) return undefined;

    const oldValue = node.value;
    this.deleteNode(node);
    this._size--;
    return oldValue;
  }

  deleteEntry(key: K, value: V): boolean {
    const node = this.getNode(key);
    if (node === null || !this._valueEq(node.value, value)) {
      return false;
    }
    this.deleteNode(node);
    this._size--;
    return true;
  }

  clear(): void {
    this._root = null;
    this._size = 0;
  }

  // ========================================================================
  // Bulk operations
  // ========================================================================

  putAll(other: NavigableMap<K, V> | Iterable<Entry<K, V>>): void {
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
    return merged;
  }

  // ========================================================================
  // SortedMap operations
  // ========================================================================

  firstKey(): K {
    if (this._root === null) {
      throw new Error("Map is empty");
    }
    return this.getFirstNode(this._root).key;
  }

  lastKey(): K {
    if (this._root === null) {
      throw new Error("Map is empty");
    }
    return this.getLastNode(this._root).key;
  }

  headMap(toKey: K): SortedMap<K, V> {
    // Return a view (simplified: create new map with filtered entries)
    const result = new TreeMap<K, V>({
      compare: this._compare,
      eq: this._eq,
      valueEq: this._valueEq,
    });

    for (const entry of this.entries()) {
      if (this._compare(entry.key, toKey) < 0) {
        result.set(entry.key, entry.value);
      } else {
        break; // Keys are sorted, so we can stop
      }
    }

    return result;
  }

  tailMap(fromKey: K): SortedMap<K, V> {
    const result = new TreeMap<K, V>({
      compare: this._compare,
      eq: this._eq,
      valueEq: this._valueEq,
    });

    let started = false;
    for (const entry of this.entries()) {
      if (!started && this._compare(entry.key, fromKey) < 0) {
        continue;
      }
      started = true;
      result.set(entry.key, entry.value);
    }

    return result;
  }

  subMap(fromKey: K, toKey: K): SortedMap<K, V> {
    const result = new TreeMap<K, V>({
      compare: this._compare,
      eq: this._eq,
      valueEq: this._valueEq,
    });

    for (const entry of this.entries()) {
      const cmpFrom = this._compare(entry.key, fromKey);
      const cmpTo = this._compare(entry.key, toKey);

      if (cmpFrom >= 0 && cmpTo < 0) {
        result.set(entry.key, entry.value);
      } else if (cmpTo >= 0) {
        break; // Past the range
      }
    }

    return result;
  }

  // ========================================================================
  // NavigableMap operations
  // ========================================================================

  floorKey(key: K): K | undefined {
    return this.floorEntry(key)?.key;
  }

  ceilingKey(key: K): K | undefined {
    return this.ceilingEntry(key)?.key;
  }

  lowerKey(key: K): K | undefined {
    return this.lowerEntry(key)?.key;
  }

  higherKey(key: K): K | undefined {
    return this.higherEntry(key)?.key;
  }

  floorEntry(key: K): Entry<K, V> | undefined {
    let node = this._root;
    let result: TreeNode<K, V> | null = null;

    while (node !== null) {
      const cmp = this._compare(key, node.key);
      if (cmp === 0) {
        return { key: node.key, value: node.value };
      } else if (cmp < 0) {
        node = node.left;
      } else {
        result = node; // This node is <= key
        node = node.right;
      }
    }

    return result ? { key: result.key, value: result.value } : undefined;
  }

  ceilingEntry(key: K): Entry<K, V> | undefined {
    let node = this._root;
    let result: TreeNode<K, V> | null = null;

    while (node !== null) {
      const cmp = this._compare(key, node.key);
      if (cmp === 0) {
        return { key: node.key, value: node.value };
      } else if (cmp > 0) {
        node = node.right;
      } else {
        result = node; // This node is >= key
        node = node.left;
      }
    }

    return result ? { key: result.key, value: result.value } : undefined;
  }

  lowerEntry(key: K): Entry<K, V> | undefined {
    let node = this._root;
    let result: TreeNode<K, V> | null = null;

    while (node !== null) {
      const cmp = this._compare(key, node.key);
      if (cmp <= 0) {
        node = node.left;
      } else {
        result = node; // This node is < key
        node = node.right;
      }
    }

    return result ? { key: result.key, value: result.value } : undefined;
  }

  higherEntry(key: K): Entry<K, V> | undefined {
    let node = this._root;
    let result: TreeNode<K, V> | null = null;

    while (node !== null) {
      const cmp = this._compare(key, node.key);
      if (cmp >= 0) {
        node = node.right;
      } else {
        result = node; // This node is > key
        node = node.left;
      }
    }

    return result ? { key: result.key, value: result.value } : undefined;
  }

  firstEntry(): Entry<K, V> | undefined {
    if (this._root === null) return undefined;
    const node = this.getFirstNode(this._root);
    return { key: node.key, value: node.value };
  }

  lastEntry(): Entry<K, V> | undefined {
    if (this._root === null) return undefined;
    const node = this.getLastNode(this._root);
    return { key: node.key, value: node.value };
  }

  pollFirstEntry(): Entry<K, V> | undefined {
    if (this._root === null) return undefined;
    const node = this.getFirstNode(this._root);
    const entry = { key: node.key, value: node.value };
    this.deleteNode(node);
    this._size--;
    return entry;
  }

  pollLastEntry(): Entry<K, V> | undefined {
    if (this._root === null) return undefined;
    const node = this.getLastNode(this._root);
    const entry = { key: node.key, value: node.value };
    this.deleteNode(node);
    this._size--;
    return entry;
  }

  descendingMap(): NavigableMap<K, V> {
    // Create a new TreeMap with reversed comparator
    const reversed = new TreeMap<K, V>({
      compare: (a, b) => this._compare(b, a),
      eq: this._eq,
      valueEq: this._valueEq,
    });

    for (const entry of this.entries()) {
      reversed.set(entry.key, entry.value);
    }

    return reversed;
  }

  *descendingKeys(): IterableIterator<K> {
    yield* this.reverseInOrderTraversal(this._root, (node) => node.key);
  }

  // ========================================================================
  // View operations
  // ========================================================================

  *keys(): IterableIterator<K> {
    yield* this.inOrderTraversal(this._root, (node) => node.key);
  }

  *values(): IterableIterator<V> {
    yield* this.inOrderTraversal(this._root, (node) => node.value);
  }

  *entries(): IterableIterator<Entry<K, V>> {
    yield* this.inOrderTraversal(this._root, (node) => ({
      key: node.key,
      value: node.value,
    }));
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
  // Private helpers - Tree operations
  // ========================================================================

  private createNode(key: K, value: V, color: Color): TreeNode<K, V> {
    return {
      key,
      value,
      color,
      left: null,
      right: null,
      parent: null,
    };
  }

  private getNode(key: K): TreeNode<K, V> | null {
    let node = this._root;

    while (node !== null) {
      const cmp = this._compare(key, node.key);
      if (cmp === 0) {
        return node;
      } else if (cmp < 0) {
        node = node.left;
      } else {
        node = node.right;
      }
    }

    return null;
  }

  private getFirstNode(node: TreeNode<K, V>): TreeNode<K, V> {
    while (node.left !== null) {
      node = node.left;
    }
    return node;
  }

  private getLastNode(node: TreeNode<K, V>): TreeNode<K, V> {
    while (node.right !== null) {
      node = node.right;
    }
    return node;
  }

  private findValue(node: TreeNode<K, V> | null, value: V): boolean {
    if (node === null) return false;
    if (this._valueEq(node.value, value)) return true;
    return this.findValue(node.left, value) || this.findValue(node.right, value);
  }

  private *inOrderTraversal<T>(
    node: TreeNode<K, V> | null,
    mapper: (node: TreeNode<K, V>) => T
  ): IterableIterator<T> {
    if (node === null) return;
    yield* this.inOrderTraversal(node.left, mapper);
    yield mapper(node);
    yield* this.inOrderTraversal(node.right, mapper);
  }

  private *reverseInOrderTraversal<T>(
    node: TreeNode<K, V> | null,
    mapper: (node: TreeNode<K, V>) => T
  ): IterableIterator<T> {
    if (node === null) return;
    yield* this.reverseInOrderTraversal(node.right, mapper);
    yield mapper(node);
    yield* this.reverseInOrderTraversal(node.left, mapper);
  }

  // ========================================================================
  // Private helpers - Red-black tree balancing
  // ========================================================================

  private rotateLeft(node: TreeNode<K, V> | null): void {
    if (node === null || node.right === null) return;
    const right = node.right;
    node.right = right.left;

    if (right.left !== null) {
      right.left.parent = node;
    }

    right.parent = node.parent;

    if (node.parent === null) {
      this._root = right;
    } else if (node === node.parent.left) {
      node.parent.left = right;
    } else {
      node.parent.right = right;
    }

    right.left = node;
    node.parent = right;
  }

  private rotateRight(node: TreeNode<K, V> | null): void {
    if (node === null || node.left === null) return;
    const left = node.left;
    node.left = left.right;

    if (left.right !== null) {
      left.right.parent = node;
    }

    left.parent = node.parent;

    if (node.parent === null) {
      this._root = left;
    } else if (node === node.parent.right) {
      node.parent.right = left;
    } else {
      node.parent.left = left;
    }

    left.right = node;
    node.parent = left;
  }

  private fixAfterInsertion(node: TreeNode<K, V>): void {
    while (node.parent !== null && node.parent.color === Color.RED) {
      if (node.parent === node.parent.parent?.left) {
        const uncle = node.parent.parent.right;

        if (uncle?.color === Color.RED) {
          // Case 1: Uncle is red
          node.parent.color = Color.BLACK;
          uncle.color = Color.BLACK;
          node.parent.parent.color = Color.RED;
          node = node.parent.parent;
        } else {
          if (node === node.parent.right) {
            // Case 2: Node is right child
            node = node.parent;
            this.rotateLeft(node);
          }
          // Case 3: Node is left child
          node.parent!.color = Color.BLACK;
          node.parent!.parent!.color = Color.RED;
          this.rotateRight(node.parent!.parent!);
        }
      } else {
        const uncle = node.parent.parent?.left ?? null;

        if (uncle?.color === Color.RED) {
          // Case 1: Uncle is red
          node.parent.color = Color.BLACK;
          uncle.color = Color.BLACK;
          node.parent.parent!.color = Color.RED;
          node = node.parent.parent!;
        } else {
          if (node === node.parent.left) {
            // Case 2: Node is left child
            node = node.parent;
            this.rotateRight(node);
          }
          // Case 3: Node is right child
          node.parent!.color = Color.BLACK;
          node.parent!.parent!.color = Color.RED;
          this.rotateLeft(node.parent!.parent!);
        }
      }
    }

    this._root!.color = Color.BLACK;
  }

  /**
   * Deletes a node (the CLRS algorithm, as in java.util.TreeMap). A null leaf counts as black.
   *
   * Before (BUGS-2026-07 L10): the deletion of a black leaf skipped the fix-up, so the black
   * heights drifted and the tree became unbalanced, and the fix-up treated a null leaf as
   * "not black", so it chose the wrong case and rotated at null (a TypeError).
   */
  private deleteNode(target: TreeNode<K, V>): void {
    let node = target;
    // A node with two children takes the key and value of its successor, then the successor goes
    if (node.left !== null && node.right !== null) {
      const successor = this.getFirstNode(node.right);
      node.key = successor.key;
      node.value = successor.value;
      node = successor;
    }

    const replacement = node.left ?? node.right;
    if (replacement !== null) {
      replacement.parent = node.parent;
      if (node.parent === null) this._root = replacement;
      else if (node === node.parent.left) node.parent.left = replacement;
      else node.parent.right = replacement;
      node.left = node.right = node.parent = null;
      if (node.color === Color.BLACK) this.fixAfterDeletion(replacement);
    } else if (node.parent === null) {
      // The only node
      this._root = null;
    } else {
      // A leaf: it is its own phantom replacement during the fix-up, then it goes
      if (node.color === Color.BLACK) this.fixAfterDeletion(node);
      if (node.parent !== null) {
        if (node === node.parent.left) node.parent.left = null;
        else if (node === node.parent.right) node.parent.right = null;
        node.parent = null;
      }
    }
  }

  private fixAfterDeletion(start: TreeNode<K, V>): void {
    let x: TreeNode<K, V> | null = start;
    while (x !== this._root && colorOf(x) === Color.BLACK) {
      if (x === leftOf(parentOf(x))) {
        let sibling = rightOf(parentOf(x));
        if (colorOf(sibling) === Color.RED) {
          setColor(sibling, Color.BLACK);
          setColor(parentOf(x), Color.RED);
          this.rotateLeft(parentOf(x));
          sibling = rightOf(parentOf(x));
        }
        if (colorOf(leftOf(sibling)) === Color.BLACK && colorOf(rightOf(sibling)) === Color.BLACK) {
          setColor(sibling, Color.RED);
          x = parentOf(x);
        } else {
          if (colorOf(rightOf(sibling)) === Color.BLACK) {
            setColor(leftOf(sibling), Color.BLACK);
            setColor(sibling, Color.RED);
            this.rotateRight(sibling);
            sibling = rightOf(parentOf(x));
          }
          setColor(sibling, colorOf(parentOf(x)));
          setColor(parentOf(x), Color.BLACK);
          setColor(rightOf(sibling), Color.BLACK);
          this.rotateLeft(parentOf(x));
          x = this._root;
        }
      } else {
        let sibling = leftOf(parentOf(x));
        if (colorOf(sibling) === Color.RED) {
          setColor(sibling, Color.BLACK);
          setColor(parentOf(x), Color.RED);
          this.rotateRight(parentOf(x));
          sibling = leftOf(parentOf(x));
        }
        if (colorOf(rightOf(sibling)) === Color.BLACK && colorOf(leftOf(sibling)) === Color.BLACK) {
          setColor(sibling, Color.RED);
          x = parentOf(x);
        } else {
          if (colorOf(leftOf(sibling)) === Color.BLACK) {
            setColor(rightOf(sibling), Color.BLACK);
            setColor(sibling, Color.RED);
            this.rotateLeft(sibling);
            sibling = leftOf(parentOf(x));
          }
          setColor(sibling, colorOf(parentOf(x)));
          setColor(parentOf(x), Color.BLACK);
          setColor(leftOf(sibling), Color.BLACK);
          this.rotateRight(parentOf(x));
          x = this._root;
        }
      }
    }
    setColor(x, Color.BLACK);
  }

  // ========================================================================
  // Utility methods
  // ========================================================================

  toString(): string {
    const entries = Array.from(this.entries())
      .map(({ key, value }) => `${key}=${value}`)
      .join(', ');
    return `TreeMap{${entries}}`;
  }
}

/**
 * Factory function to create a TreeMap.
 *
 * @example
 * const map = treeMap<string, number>()
 * map.set('c', 3)
 * map.set('a', 1)
 * map.set('b', 2)
 * // Iteration order: a, b, c
 *
 * @example
 * // With initial entries
 * const map = treeMap<string, number>([
 *   ['c', 3],
 *   ['a', 1],
 *   ['b', 2]
 * ])
 *
 * @example
 * // Custom comparator for descending order
 * const map = treeMap<number, string>({ compare: (a, b) => b - a })
 */
export function treeMap<K, V>(
  optionsOrEntries?: TreeMapOptions<K, V> | Iterable<[K, V]>
): TreeMap<K, V> {
  if (optionsOrEntries && Symbol.iterator in optionsOrEntries) {
    const map = new TreeMap<K, V>();
    for (const [key, value] of optionsOrEntries as Iterable<[K, V]>) {
      map.set(key, value);
    }
    return map;
  }

  return new TreeMap<K, V>(optionsOrEntries as TreeMapOptions<K, V>);
}
