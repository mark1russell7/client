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
import { HashMap } from "./hash-map.js";
import { defaultEq, defaultHash } from "../utils/defaults.js";
/**
 * Dummy value used for the HashMap backing the set.
 */
const PRESENT = Symbol("PRESENT");
/**
 * HashSet<T> - Hash table implementation of the Set interface.
 *
 * Backed by a HashMap where values are a dummy constant.
 * Provides constant-time performance for basic operations.
 *
 * Not thread-safe. Use synchronized() behavior for concurrent access.
 */
export class HashSet {
    _map;
    _eq;
    constructor(options = {}) {
        const { initialCapacity = 16, loadFactor = 0.75, eq = defaultEq, hash = defaultHash, } = options;
        this._eq = eq;
        this._map = new HashMap({
            initialCapacity,
            loadFactor,
            keyEq: eq,
            keyHash: hash,
        });
    }
    // ========================================================================
    // Size
    // ========================================================================
    get size() {
        return this._map.size;
    }
    get isEmpty() {
        return this._map.isEmpty;
    }
    get eq() {
        return this._eq;
    }
    // ========================================================================
    // Core set operations
    // ========================================================================
    add(element) {
        const hadElement = this._map.has(element);
        this._map.set(element, PRESENT);
        return !hadElement;
    }
    remove(element) {
        return this._map.delete(element) !== undefined;
    }
    contains(element) {
        return this._map.has(element);
    }
    // ========================================================================
    // Bulk operations
    // ========================================================================
    addAll(other) {
        let modified = false;
        for (const element of other) {
            if (this.add(element)) {
                modified = true;
            }
        }
        return modified;
    }
    removeAll(other) {
        let modified = false;
        for (const element of other) {
            if (this.remove(element)) {
                modified = true;
            }
        }
        return modified;
    }
    retainAll(other) {
        const toRetain = new globalThis.Set(other);
        const toRemove = [];
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
    containsAll(other) {
        for (const element of other) {
            if (!this.contains(element)) {
                return false;
            }
        }
        return true;
    }
    clear() {
        this._map.clear();
    }
    // ========================================================================
    // Set operations (mathematical)
    // ========================================================================
    /**
     * Returns a new set that is the union of this set and the other set.
     * Contains all elements from both sets.
     */
    union(other) {
        const result = this.clone();
        result.addAll(other);
        return result;
    }
    /**
     * Returns a new set that is the intersection of this set and the other set.
     * Contains only elements present in both sets.
     */
    intersection(other) {
        const result = new HashSet({ eq: this._eq });
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
    difference(other) {
        const result = this.clone();
        result.removeAll(other);
        return result;
    }
    /**
     * Returns a new set that is the symmetric difference of this set and the other set.
     * Contains elements in either set but not in both.
     */
    symmetricDifference(other) {
        const result = this.union(other);
        const inter = this.intersection(other);
        result.removeAll(inter);
        return result;
    }
    /**
     * Returns true if this set is a subset of the other set.
     * All elements in this set are also in the other set.
     */
    isSubsetOf(other) {
        const otherSet = new HashSet({ eq: this._eq });
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
    isSupersetOf(other) {
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
    isDisjointFrom(other) {
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
    *[Symbol.iterator]() {
        for (const entry of this._map) {
            yield entry.key;
        }
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
    /**
     * Creates a shallow copy of this set.
     */
    clone() {
        const clone = new HashSet({ eq: this._eq });
        clone.addAll(this);
        return clone;
    }
    /**
     * Returns statistics about the underlying hash table.
     */
    getStats() {
        return this._map.getStats();
    }
    /**
     * Returns a string representation for debugging.
     */
    toString() {
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
export function hashSet(optionsOrElements) {
    // Check if it's an iterable (not options)
    if (optionsOrElements && Symbol.iterator in optionsOrElements) {
        const set = new HashSet();
        set.addAll(optionsOrElements);
        return set;
    }
    return new HashSet(optionsOrElements);
}
//# sourceMappingURL=hash-set.js.map