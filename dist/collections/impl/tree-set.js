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
import { TreeMap } from "./tree-map.js";
import { defaultEq, defaultCompare } from "../utils/defaults.js";
/**
 * Dummy value used for TreeMap backing.
 */
const PRESENT = true;
/**
 * TreeSet<T> - Red-black tree based sorted set.
 *
 * Maintains elements in sorted order using a TreeMap as backing structure.
 * Provides O(log n) operations and navigation methods.
 */
export class TreeSet {
    _map;
    _compare;
    _eq;
    constructor(options = {}) {
        const { compare = defaultCompare, eq = defaultEq, } = options;
        this._compare = compare;
        this._eq = eq;
        this._map = new TreeMap({
            compare,
            eq,
        });
    }
    // ========================================================================
    // Size and state
    // ========================================================================
    get size() {
        return this._map.size;
    }
    get isEmpty() {
        return this._map.isEmpty;
    }
    get comparator() {
        return this._compare;
    }
    get eq() {
        return this._eq;
    }
    // ========================================================================
    // Membership operations
    // ========================================================================
    has(element) {
        return this._map.has(element);
    }
    contains(element) {
        return this.has(element);
    }
    containsAll(other) {
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
    add(element) {
        const oldValue = this._map.set(element, PRESENT);
        return oldValue === undefined; // Returns true if element was added (not already present)
    }
    remove(element) {
        const removed = this._map.delete(element);
        return removed !== undefined;
    }
    clear() {
        this._map.clear();
    }
    // ========================================================================
    // Bulk operations
    // ========================================================================
    addAll(elements) {
        let modified = false;
        for (const element of elements) {
            if (this.add(element)) {
                modified = true;
            }
        }
        return modified;
    }
    removeAll(elements) {
        let modified = false;
        for (const element of elements) {
            if (this.remove(element)) {
                modified = true;
            }
        }
        return modified;
    }
    retainAll(elements) {
        const toRetain = new Set();
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
    union(other) {
        const result = new TreeSet({
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
    intersection(other) {
        const result = new TreeSet({
            compare: this._compare,
            eq: this._eq,
        });
        const otherSet = new Set();
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
    difference(other) {
        const result = new TreeSet({
            compare: this._compare,
            eq: this._eq,
        });
        const otherSet = new Set();
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
    symmetricDifference(other) {
        const result = new TreeSet({
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
            }
            else {
                result.add(element);
            }
        }
        return result;
    }
    isSubsetOf(other) {
        const otherSet = new Set();
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
    isSupersetOf(other) {
        for (const element of other) {
            if (!this.has(element)) {
                return false;
            }
        }
        return true;
    }
    isDisjointFrom(other) {
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
    first() {
        const key = this._map.firstKey();
        return key;
    }
    last() {
        const key = this._map.lastKey();
        return key;
    }
    headSet(toElement) {
        const result = new TreeSet({
            compare: this._compare,
            eq: this._eq,
        });
        for (const element of this) {
            if (this._compare(element, toElement) < 0) {
                result.add(element);
            }
            else {
                break; // Elements are sorted
            }
        }
        return result;
    }
    tailSet(fromElement) {
        const result = new TreeSet({
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
    subSet(fromElement, toElement) {
        const result = new TreeSet({
            compare: this._compare,
            eq: this._eq,
        });
        for (const element of this) {
            const cmpFrom = this._compare(element, fromElement);
            const cmpTo = this._compare(element, toElement);
            if (cmpFrom >= 0 && cmpTo < 0) {
                result.add(element);
            }
            else if (cmpTo >= 0) {
                break; // Past the range
            }
        }
        return result;
    }
    // ========================================================================
    // NavigableSet operations
    // ========================================================================
    floor(element) {
        return this._map.floorKey(element);
    }
    ceiling(element) {
        return this._map.ceilingKey(element);
    }
    lower(element) {
        return this._map.lowerKey(element);
    }
    higher(element) {
        return this._map.higherKey(element);
    }
    pollFirst() {
        const entry = this._map.pollFirstEntry();
        return entry?.key;
    }
    pollLast() {
        const entry = this._map.pollLastEntry();
        return entry?.key;
    }
    descendingSet() {
        const reversed = new TreeSet({
            compare: (a, b) => this._compare(b, a),
            eq: this._eq,
        });
        for (const element of this) {
            reversed.add(element);
        }
        return reversed;
    }
    *descendingIterator() {
        yield* this._map.descendingKeys();
    }
    // ========================================================================
    // View operations
    // ========================================================================
    *[Symbol.iterator]() {
        yield* this._map.keys();
    }
    forEach(action) {
        let index = 0;
        for (const element of this) {
            action(element, index++);
        }
    }
    toArray() {
        return Array.from(this);
    }
    // ========================================================================
    // Utility methods
    // ========================================================================
    toString() {
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
export function treeSet(optionsOrElements) {
    if (optionsOrElements && Symbol.iterator in optionsOrElements) {
        const set = new TreeSet();
        for (const element of optionsOrElements) {
            set.add(element);
        }
        return set;
    }
    return new TreeSet(optionsOrElements);
}
//# sourceMappingURL=tree-set.js.map