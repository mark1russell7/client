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
import { defaultEq, defaultCompare } from "../utils/defaults.js";
/**
 * Node color in red-black tree.
 */
var Color;
(function (Color) {
    Color["RED"] = "RED";
    Color["BLACK"] = "BLACK";
})(Color || (Color = {}));
/**
 * TreeMap<K, V> - Red-black tree based sorted map.
 *
 * Maintains keys in sorted order using a self-balancing binary search tree.
 * Provides O(log n) operations and navigation methods.
 */
export class TreeMap {
    _root = null;
    _size = 0;
    _compare;
    _eq;
    _valueEq;
    constructor(options = {}) {
        const { compare = defaultCompare, eq = defaultEq, valueEq = defaultEq, } = options;
        this._compare = compare;
        this._eq = eq;
        this._valueEq = valueEq;
    }
    // ========================================================================
    // Size and state
    // ========================================================================
    get size() {
        return this._size;
    }
    get isEmpty() {
        return this._size === 0;
    }
    get comparator() {
        return this._compare;
    }
    get keyEq() {
        return this._eq;
    }
    get valueEq() {
        return this._valueEq;
    }
    // ========================================================================
    // Lookup operations
    // ========================================================================
    has(key) {
        return this.getNode(key) !== null;
    }
    containsKey(key) {
        return this.has(key);
    }
    containsValue(value) {
        return this.findValue(this._root, value);
    }
    get(key) {
        const node = this.getNode(key);
        if (node === null) {
            throw new Error("Key not found");
        }
        return node.value;
    }
    getOrUndefined(key) {
        const node = this.getNode(key);
        return node?.value;
    }
    getOrDefault(key, defaultValue) {
        const node = this.getNode(key);
        return node !== null ? node.value : defaultValue;
    }
    // ========================================================================
    // Modification operations
    // ========================================================================
    set(key, value) {
        if (this._root === null) {
            this._root = this.createNode(key, value, Color.BLACK);
            this._size++;
            return undefined;
        }
        // Find insertion point
        let node = this._root;
        let parent = null;
        while (node !== null) {
            parent = node;
            const cmp = this._compare(key, node.key);
            if (cmp === 0) {
                // Key exists, replace value
                const oldValue = node.value;
                node.value = value;
                return oldValue;
            }
            else if (cmp < 0) {
                node = node.left;
            }
            else {
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
            }
            else {
                parent.right = newNode;
            }
        }
        this._size++;
        this.fixAfterInsertion(newNode);
        return undefined;
    }
    setIfAbsent(key, value) {
        const existing = this.getNode(key);
        if (existing !== null) {
            return existing.value;
        }
        this.set(key, value);
        return value;
    }
    replace(key, value) {
        const node = this.getNode(key);
        if (node === null)
            return undefined;
        const oldValue = node.value;
        node.value = value;
        return oldValue;
    }
    replaceEntry(key, oldValue, newValue) {
        const node = this.getNode(key);
        if (node === null || !this._valueEq(node.value, oldValue)) {
            return false;
        }
        node.value = newValue;
        return true;
    }
    delete(key) {
        const node = this.getNode(key);
        if (node === null)
            return undefined;
        const oldValue = node.value;
        this.deleteNode(node);
        this._size--;
        return oldValue;
    }
    deleteEntry(key, value) {
        const node = this.getNode(key);
        if (node === null || !this._valueEq(node.value, value)) {
            return false;
        }
        this.deleteNode(node);
        this._size--;
        return true;
    }
    clear() {
        this._root = null;
        this._size = 0;
    }
    // ========================================================================
    // Bulk operations
    // ========================================================================
    putAll(other) {
        if ('entries' in other && typeof other.entries === 'function') {
            for (const entry of other.entries()) {
                this.set(entry.key, entry.value);
            }
        }
        else {
            for (const entry of other) {
                this.set(entry.key, entry.value);
            }
        }
    }
    // ========================================================================
    // Computed operations
    // ========================================================================
    computeIfAbsent(key, mappingFunction) {
        const existing = this.getNode(key);
        if (existing !== null) {
            return existing.value;
        }
        const value = mappingFunction(key);
        this.set(key, value);
        return value;
    }
    computeIfPresent(key, remappingFunction) {
        const existing = this.getNode(key);
        if (existing === null)
            return undefined;
        const newValue = remappingFunction(key, existing.value);
        if (newValue === undefined) {
            this.delete(key);
            return undefined;
        }
        existing.value = newValue;
        return newValue;
    }
    compute(key, remappingFunction) {
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
    merge(key, value, remappingFunction) {
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
    firstKey() {
        if (this._root === null) {
            throw new Error("Map is empty");
        }
        return this.getFirstNode(this._root).key;
    }
    lastKey() {
        if (this._root === null) {
            throw new Error("Map is empty");
        }
        return this.getLastNode(this._root).key;
    }
    headMap(toKey) {
        // Return a view (simplified: create new map with filtered entries)
        const result = new TreeMap({
            compare: this._compare,
            eq: this._eq,
            valueEq: this._valueEq,
        });
        for (const entry of this.entries()) {
            if (this._compare(entry.key, toKey) < 0) {
                result.set(entry.key, entry.value);
            }
            else {
                break; // Keys are sorted, so we can stop
            }
        }
        return result;
    }
    tailMap(fromKey) {
        const result = new TreeMap({
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
    subMap(fromKey, toKey) {
        const result = new TreeMap({
            compare: this._compare,
            eq: this._eq,
            valueEq: this._valueEq,
        });
        for (const entry of this.entries()) {
            const cmpFrom = this._compare(entry.key, fromKey);
            const cmpTo = this._compare(entry.key, toKey);
            if (cmpFrom >= 0 && cmpTo < 0) {
                result.set(entry.key, entry.value);
            }
            else if (cmpTo >= 0) {
                break; // Past the range
            }
        }
        return result;
    }
    // ========================================================================
    // NavigableMap operations
    // ========================================================================
    floorKey(key) {
        return this.floorEntry(key)?.key;
    }
    ceilingKey(key) {
        return this.ceilingEntry(key)?.key;
    }
    lowerKey(key) {
        return this.lowerEntry(key)?.key;
    }
    higherKey(key) {
        return this.higherEntry(key)?.key;
    }
    floorEntry(key) {
        let node = this._root;
        let result = null;
        while (node !== null) {
            const cmp = this._compare(key, node.key);
            if (cmp === 0) {
                return { key: node.key, value: node.value };
            }
            else if (cmp < 0) {
                node = node.left;
            }
            else {
                result = node; // This node is <= key
                node = node.right;
            }
        }
        return result ? { key: result.key, value: result.value } : undefined;
    }
    ceilingEntry(key) {
        let node = this._root;
        let result = null;
        while (node !== null) {
            const cmp = this._compare(key, node.key);
            if (cmp === 0) {
                return { key: node.key, value: node.value };
            }
            else if (cmp > 0) {
                node = node.right;
            }
            else {
                result = node; // This node is >= key
                node = node.left;
            }
        }
        return result ? { key: result.key, value: result.value } : undefined;
    }
    lowerEntry(key) {
        let node = this._root;
        let result = null;
        while (node !== null) {
            const cmp = this._compare(key, node.key);
            if (cmp <= 0) {
                node = node.left;
            }
            else {
                result = node; // This node is < key
                node = node.right;
            }
        }
        return result ? { key: result.key, value: result.value } : undefined;
    }
    higherEntry(key) {
        let node = this._root;
        let result = null;
        while (node !== null) {
            const cmp = this._compare(key, node.key);
            if (cmp >= 0) {
                node = node.right;
            }
            else {
                result = node; // This node is > key
                node = node.left;
            }
        }
        return result ? { key: result.key, value: result.value } : undefined;
    }
    firstEntry() {
        if (this._root === null)
            return undefined;
        const node = this.getFirstNode(this._root);
        return { key: node.key, value: node.value };
    }
    lastEntry() {
        if (this._root === null)
            return undefined;
        const node = this.getLastNode(this._root);
        return { key: node.key, value: node.value };
    }
    pollFirstEntry() {
        if (this._root === null)
            return undefined;
        const node = this.getFirstNode(this._root);
        const entry = { key: node.key, value: node.value };
        this.deleteNode(node);
        this._size--;
        return entry;
    }
    pollLastEntry() {
        if (this._root === null)
            return undefined;
        const node = this.getLastNode(this._root);
        const entry = { key: node.key, value: node.value };
        this.deleteNode(node);
        this._size--;
        return entry;
    }
    descendingMap() {
        // Create a new TreeMap with reversed comparator
        const reversed = new TreeMap({
            compare: (a, b) => this._compare(b, a),
            eq: this._eq,
            valueEq: this._valueEq,
        });
        for (const entry of this.entries()) {
            reversed.set(entry.key, entry.value);
        }
        return reversed;
    }
    *descendingKeys() {
        yield* this.reverseInOrderTraversal(this._root, (node) => node.key);
    }
    // ========================================================================
    // View operations
    // ========================================================================
    *keys() {
        yield* this.inOrderTraversal(this._root, (node) => node.key);
    }
    *values() {
        yield* this.inOrderTraversal(this._root, (node) => node.value);
    }
    *entries() {
        yield* this.inOrderTraversal(this._root, (node) => ({
            key: node.key,
            value: node.value,
        }));
    }
    *[Symbol.iterator]() {
        yield* this.entries();
    }
    forEach(action) {
        for (const entry of this.entries()) {
            action(entry.value, entry.key, this);
        }
    }
    toArray() {
        return Array.from(this.entries());
    }
    // ========================================================================
    // Private helpers - Tree operations
    // ========================================================================
    createNode(key, value, color) {
        return {
            key,
            value,
            color,
            left: null,
            right: null,
            parent: null,
        };
    }
    getNode(key) {
        let node = this._root;
        while (node !== null) {
            const cmp = this._compare(key, node.key);
            if (cmp === 0) {
                return node;
            }
            else if (cmp < 0) {
                node = node.left;
            }
            else {
                node = node.right;
            }
        }
        return null;
    }
    getFirstNode(node) {
        while (node.left !== null) {
            node = node.left;
        }
        return node;
    }
    getLastNode(node) {
        while (node.right !== null) {
            node = node.right;
        }
        return node;
    }
    findValue(node, value) {
        if (node === null)
            return false;
        if (this._valueEq(node.value, value))
            return true;
        return this.findValue(node.left, value) || this.findValue(node.right, value);
    }
    *inOrderTraversal(node, mapper) {
        if (node === null)
            return;
        yield* this.inOrderTraversal(node.left, mapper);
        yield mapper(node);
        yield* this.inOrderTraversal(node.right, mapper);
    }
    *reverseInOrderTraversal(node, mapper) {
        if (node === null)
            return;
        yield* this.reverseInOrderTraversal(node.right, mapper);
        yield mapper(node);
        yield* this.reverseInOrderTraversal(node.left, mapper);
    }
    // ========================================================================
    // Private helpers - Red-black tree balancing
    // ========================================================================
    rotateLeft(node) {
        const right = node.right;
        node.right = right.left;
        if (right.left !== null) {
            right.left.parent = node;
        }
        right.parent = node.parent;
        if (node.parent === null) {
            this._root = right;
        }
        else if (node === node.parent.left) {
            node.parent.left = right;
        }
        else {
            node.parent.right = right;
        }
        right.left = node;
        node.parent = right;
    }
    rotateRight(node) {
        const left = node.left;
        node.left = left.right;
        if (left.right !== null) {
            left.right.parent = node;
        }
        left.parent = node.parent;
        if (node.parent === null) {
            this._root = left;
        }
        else if (node === node.parent.right) {
            node.parent.right = left;
        }
        else {
            node.parent.left = left;
        }
        left.right = node;
        node.parent = left;
    }
    fixAfterInsertion(node) {
        while (node.parent !== null && node.parent.color === Color.RED) {
            if (node.parent === node.parent.parent?.left) {
                const uncle = node.parent.parent.right;
                if (uncle?.color === Color.RED) {
                    // Case 1: Uncle is red
                    node.parent.color = Color.BLACK;
                    uncle.color = Color.BLACK;
                    node.parent.parent.color = Color.RED;
                    node = node.parent.parent;
                }
                else {
                    if (node === node.parent.right) {
                        // Case 2: Node is right child
                        node = node.parent;
                        this.rotateLeft(node);
                    }
                    // Case 3: Node is left child
                    node.parent.color = Color.BLACK;
                    node.parent.parent.color = Color.RED;
                    this.rotateRight(node.parent.parent);
                }
            }
            else {
                const uncle = node.parent.parent?.left ?? null;
                if (uncle?.color === Color.RED) {
                    // Case 1: Uncle is red
                    node.parent.color = Color.BLACK;
                    uncle.color = Color.BLACK;
                    node.parent.parent.color = Color.RED;
                    node = node.parent.parent;
                }
                else {
                    if (node === node.parent.left) {
                        // Case 2: Node is left child
                        node = node.parent;
                        this.rotateRight(node);
                    }
                    // Case 3: Node is right child
                    node.parent.color = Color.BLACK;
                    node.parent.parent.color = Color.RED;
                    this.rotateLeft(node.parent.parent);
                }
            }
        }
        this._root.color = Color.BLACK;
    }
    deleteNode(node) {
        let replacement;
        let deletedColor;
        // Find replacement node
        if (node.left === null || node.right === null) {
            replacement = node;
        }
        else {
            // Node has two children, find successor
            replacement = this.getFirstNode(node.right);
        }
        // Get the child of replacement (at most one child)
        const child = replacement.left !== null ? replacement.left : replacement.right;
        if (child !== null) {
            child.parent = replacement.parent;
        }
        if (replacement.parent === null) {
            this._root = child;
        }
        else if (replacement === replacement.parent.left) {
            replacement.parent.left = child;
        }
        else {
            replacement.parent.right = child;
        }
        deletedColor = replacement.color;
        // If we replaced with successor, copy its data to node
        if (replacement !== node) {
            node.key = replacement.key;
            node.value = replacement.value;
        }
        // Fix red-black properties if we deleted a black node
        if (deletedColor === Color.BLACK && child !== null) {
            this.fixAfterDeletion(child);
        }
    }
    fixAfterDeletion(node) {
        while (node !== this._root && node.color === Color.BLACK) {
            if (node === node.parent?.left) {
                let sibling = node.parent.right;
                if (sibling?.color === Color.RED) {
                    // Case 1: Sibling is red
                    sibling.color = Color.BLACK;
                    node.parent.color = Color.RED;
                    this.rotateLeft(node.parent);
                    sibling = node.parent.right;
                }
                if (sibling?.left?.color === Color.BLACK &&
                    sibling?.right?.color === Color.BLACK) {
                    // Case 2: Sibling's children are black
                    if (sibling)
                        sibling.color = Color.RED;
                    node = node.parent;
                }
                else {
                    if (sibling?.right?.color === Color.BLACK) {
                        // Case 3: Sibling's right child is black
                        if (sibling.left)
                            sibling.left.color = Color.BLACK;
                        sibling.color = Color.RED;
                        this.rotateRight(sibling);
                        sibling = node.parent?.right ?? null;
                    }
                    // Case 4: Sibling's right child is red
                    if (sibling) {
                        sibling.color = node.parent?.color ?? Color.BLACK;
                        if (sibling.right)
                            sibling.right.color = Color.BLACK;
                    }
                    if (node.parent) {
                        node.parent.color = Color.BLACK;
                        this.rotateLeft(node.parent);
                    }
                    node = this._root;
                }
            }
            else {
                let sibling = node.parent?.left ?? null;
                if (sibling?.color === Color.RED) {
                    // Case 1: Sibling is red
                    sibling.color = Color.BLACK;
                    node.parent.color = Color.RED;
                    this.rotateRight(node.parent);
                    sibling = node.parent?.left ?? null;
                }
                if (sibling?.right?.color === Color.BLACK &&
                    sibling?.left?.color === Color.BLACK) {
                    // Case 2: Sibling's children are black
                    if (sibling)
                        sibling.color = Color.RED;
                    node = node.parent;
                }
                else {
                    if (sibling?.left?.color === Color.BLACK) {
                        // Case 3: Sibling's left child is black
                        if (sibling.right)
                            sibling.right.color = Color.BLACK;
                        sibling.color = Color.RED;
                        this.rotateLeft(sibling);
                        sibling = node.parent?.left ?? null;
                    }
                    // Case 4: Sibling's left child is red
                    if (sibling) {
                        sibling.color = node.parent?.color ?? Color.BLACK;
                        if (sibling.left)
                            sibling.left.color = Color.BLACK;
                    }
                    if (node.parent) {
                        node.parent.color = Color.BLACK;
                        this.rotateRight(node.parent);
                    }
                    node = this._root;
                }
            }
        }
        if (node)
            node.color = Color.BLACK;
    }
    // ========================================================================
    // Utility methods
    // ========================================================================
    toString() {
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
export function treeMap(optionsOrEntries) {
    if (optionsOrEntries && Symbol.iterator in optionsOrEntries) {
        const map = new TreeMap();
        for (const [key, value] of optionsOrEntries) {
            map.set(key, value);
        }
        return map;
    }
    return new TreeMap(optionsOrEntries);
}
//# sourceMappingURL=tree-map.js.map