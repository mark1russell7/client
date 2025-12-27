/**
 * LinkedList implementation - A doubly-linked list.
 *
 * Provides O(1) insertion/removal at both ends and at known positions.
 * Slower random access O(n) compared to ArrayList.
 * Mirrors java.util.LinkedList.
 *
 * @example
 * const list = linkedList<number>()
 * list.addFirst(1)
 * list.addLast(2)
 * list.add(3)
 */
import { defaultEq, defaultCompare } from "../utils/defaults.js";
/**
 * Internal node structure for the linked list.
 */
class Node {
    value;
    prev;
    next;
    constructor(value, prev = null, next = null) {
        this.value = value;
        this.prev = prev;
        this.next = next;
    }
}
/**
 * LinkedList<T> - Doubly-linked list implementation.
 *
 * Efficient for:
 * - Insertion/removal at ends: O(1)
 * - Insertion/removal at known position: O(1)
 * - Sequential iteration: O(n)
 *
 * Not efficient for:
 * - Random access by index: O(n)
 * - Search: O(n)
 *
 * Implements both List and Deque interfaces.
 */
export class LinkedList {
    _head = null;
    _tail = null;
    _size = 0;
    _eq;
    constructor(options = {}) {
        const { eq = defaultEq } = options;
        this._eq = eq;
    }
    // ========================================================================
    // Size
    // ========================================================================
    get size() {
        return this._size;
    }
    get isEmpty() {
        return this._size === 0;
    }
    get eq() {
        return this._eq;
    }
    // ========================================================================
    // Deque operations (both ends)
    // ========================================================================
    addFirst(element) {
        const newNode = new Node(element, null, this._head);
        if (this._head) {
            this._head.prev = newNode;
        }
        this._head = newNode;
        if (!this._tail) {
            this._tail = newNode;
        }
        this._size++;
    }
    addLast(element) {
        const newNode = new Node(element, this._tail, null);
        if (this._tail) {
            this._tail.next = newNode;
        }
        this._tail = newNode;
        if (!this._head) {
            this._head = newNode;
        }
        this._size++;
    }
    removeFirst() {
        if (!this._head) {
            throw new Error("List is empty");
        }
        return this.pollFirst();
    }
    removeLast() {
        if (!this._tail) {
            throw new Error("List is empty");
        }
        return this.pollLast();
    }
    pollFirst() {
        if (!this._head)
            return undefined;
        const value = this._head.value;
        this._head = this._head.next;
        if (this._head) {
            this._head.prev = null;
        }
        else {
            this._tail = null;
        }
        this._size--;
        return value;
    }
    pollLast() {
        if (!this._tail)
            return undefined;
        const value = this._tail.value;
        this._tail = this._tail.prev;
        if (this._tail) {
            this._tail.next = null;
        }
        else {
            this._head = null;
        }
        this._size--;
        return value;
    }
    peekFirst() {
        if (!this._head) {
            throw new Error("List is empty");
        }
        return this._head.value;
    }
    peekLast() {
        if (!this._tail) {
            throw new Error("List is empty");
        }
        return this._tail.value;
    }
    peekFirstOrUndefined() {
        return this._head?.value;
    }
    peekLastOrUndefined() {
        return this._tail?.value;
    }
    offerFirst(element) {
        this.addFirst(element);
        return true;
    }
    offerLast(element) {
        this.addLast(element);
        return true;
    }
    // ========================================================================
    // Stack operations (LIFO)
    // ========================================================================
    push(element) {
        this.addFirst(element);
    }
    pop() {
        return this.removeFirst();
    }
    // ========================================================================
    // Queue operations (FIFO)
    // ========================================================================
    offer(element) {
        return this.offerLast(element);
    }
    poll() {
        return this.removeFirst();
    }
    peek() {
        return this.peekFirst();
    }
    peekOrUndefined() {
        return this.peekFirstOrUndefined();
    }
    pollOrUndefined() {
        return this.pollFirst();
    }
    enqueue(element) {
        return this.offer(element);
    }
    dequeue() {
        return this.poll();
    }
    // ========================================================================
    // List operations
    // ========================================================================
    get(index) {
        const node = this.getNode(index);
        return node.value;
    }
    set(index, element) {
        const node = this.getNode(index);
        const old = node.value;
        node.value = element;
        return old;
    }
    insert(index, element) {
        if (index < 0 || index > this._size) {
            throw new RangeError(`Index ${index} out of bounds for size ${this._size}`);
        }
        if (index === 0) {
            this.addFirst(element);
            return;
        }
        if (index === this._size) {
            this.addLast(element);
            return;
        }
        const nextNode = this.getNode(index);
        const prevNode = nextNode.prev;
        const newNode = new Node(element, prevNode, nextNode);
        prevNode.next = newNode;
        nextNode.prev = newNode;
        this._size++;
    }
    insertAll(index, other) {
        if (index < 0 || index > this._size) {
            throw new RangeError(`Index ${index} out of bounds for size ${this._size}`);
        }
        const elements = Array.from(other);
        if (elements.length === 0)
            return false;
        for (let i = 0; i < elements.length; i++) {
            this.insert(index + i, elements[i]);
        }
        return true;
    }
    removeAt(index) {
        const node = this.getNode(index);
        return this.unlinkNode(node);
    }
    removeRange(fromIndex, toIndex) {
        if (fromIndex < 0 || toIndex > this._size || fromIndex > toIndex) {
            throw new RangeError(`Invalid range [${fromIndex}, ${toIndex})`);
        }
        for (let i = fromIndex; i < toIndex; i++) {
            this.removeAt(fromIndex);
        }
    }
    indexOf(element, fromIndex = 0) {
        let index = 0;
        let node = this._head;
        while (node) {
            if (index >= fromIndex && this._eq(node.value, element)) {
                return index;
            }
            node = node.next;
            index++;
        }
        return -1;
    }
    lastIndexOf(element, fromIndex) {
        const start = fromIndex !== undefined ? fromIndex : this._size - 1;
        let index = this._size - 1;
        let node = this._tail;
        while (node && index >= 0) {
            if (index <= start && this._eq(node.value, element)) {
                return index;
            }
            node = node.prev;
            index--;
        }
        return -1;
    }
    first() {
        return this.peekFirst();
    }
    last() {
        return this.peekLast();
    }
    shift() {
        return this.removeFirst();
    }
    unshift(element) {
        this.addFirst(element);
    }
    // ========================================================================
    // Collection operations
    // ========================================================================
    add(element) {
        this.addLast(element);
        return true;
    }
    addAll(other) {
        let modified = false;
        for (const element of other) {
            this.addLast(element);
            modified = true;
        }
        return modified;
    }
    contains(element) {
        return this.indexOf(element) !== -1;
    }
    containsAll(other) {
        for (const element of other) {
            if (!this.contains(element))
                return false;
        }
        return true;
    }
    remove(element) {
        let node = this._head;
        while (node) {
            if (this._eq(node.value, element)) {
                this.unlinkNode(node);
                return true;
            }
            node = node.next;
        }
        return false;
    }
    removeAll(other) {
        const toRemove = new Set(other);
        let modified = false;
        for (const element of toRemove) {
            while (this.remove(element)) {
                modified = true;
            }
        }
        return modified;
    }
    retainAll(other) {
        const toRetain = new Set(other);
        let node = this._head;
        let modified = false;
        while (node) {
            const next = node.next;
            let shouldRetain = false;
            for (const retainElement of toRetain) {
                if (this._eq(node.value, retainElement)) {
                    shouldRetain = true;
                    break;
                }
            }
            if (!shouldRetain) {
                this.unlinkNode(node);
                modified = true;
            }
            node = next;
        }
        return modified;
    }
    clear() {
        this._head = null;
        this._tail = null;
        this._size = 0;
    }
    // ========================================================================
    // Sorting and reversing
    // ========================================================================
    sort(compare = defaultCompare) {
        if (this._size <= 1)
            return;
        // Convert to array, sort, rebuild list
        const array = this.toArray();
        array.sort(compare);
        this.clear();
        for (const element of array) {
            this.addLast(element);
        }
    }
    reverse() {
        if (this._size <= 1)
            return;
        let node = this._head;
        this._head = this._tail;
        this._tail = node;
        while (node) {
            const next = node.next;
            node.next = node.prev;
            node.prev = next;
            node = next;
        }
    }
    // ========================================================================
    // Views
    // ========================================================================
    subList(fromIndex, toIndex) {
        if (fromIndex < 0 || toIndex > this._size || fromIndex > toIndex) {
            throw new RangeError(`Invalid range [${fromIndex}, ${toIndex})`);
        }
        const sub = new LinkedList({ eq: this._eq });
        let index = 0;
        let node = this._head;
        while (node && index < toIndex) {
            if (index >= fromIndex) {
                sub.addLast(node.value);
            }
            node = node.next;
            index++;
        }
        return sub;
    }
    // ========================================================================
    // Iteration
    // ========================================================================
    *[Symbol.iterator]() {
        let node = this._head;
        while (node) {
            yield node.value;
            node = node.next;
        }
    }
    forEach(action) {
        let index = 0;
        let node = this._head;
        while (node) {
            action(node.value, index);
            node = node.next;
            index++;
        }
    }
    toArray() {
        const result = [];
        let node = this._head;
        while (node) {
            result.push(node.value);
            node = node.next;
        }
        return result;
    }
    // ========================================================================
    // Private helpers
    // ========================================================================
    getNode(index) {
        if (index < 0 || index >= this._size) {
            throw new RangeError(`Index ${index} out of bounds for size ${this._size}`);
        }
        // Optimize: start from head or tail depending on index
        if (index < this._size / 2) {
            // Start from head
            let node = this._head;
            for (let i = 0; i < index; i++) {
                node = node.next;
            }
            return node;
        }
        else {
            // Start from tail
            let node = this._tail;
            for (let i = this._size - 1; i > index; i--) {
                node = node.prev;
            }
            return node;
        }
    }
    unlinkNode(node) {
        const value = node.value;
        if (node.prev) {
            node.prev.next = node.next;
        }
        else {
            this._head = node.next;
        }
        if (node.next) {
            node.next.prev = node.prev;
        }
        else {
            this._tail = node.prev;
        }
        this._size--;
        return value;
    }
    // ========================================================================
    // Inspection
    // ========================================================================
    toString() {
        return `LinkedList[${this.toArray().join(", ")}]`;
    }
}
/**
 * Factory function to create a LinkedList.
 *
 * @example
 * const list = linkedList<number>()
 * const listFromArray = linkedList([1, 2, 3])
 */
export function linkedList(optionsOrElements) {
    // Check if it's an iterable (not options)
    if (optionsOrElements && Symbol.iterator in optionsOrElements) {
        const list = new LinkedList();
        list.addAll(optionsOrElements);
        return list;
    }
    return new LinkedList(optionsOrElements);
}
//# sourceMappingURL=linked-list.js.map