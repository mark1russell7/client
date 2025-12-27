/**
 * ArrayDeque implementation - A ring buffer backed double-ended queue.
 *
 * Provides O(1) insertion and removal at both ends.
 * More efficient than ArrayList for queue/stack operations.
 * Mirrors java.util.ArrayDeque.
 *
 * @example
 * const deque = arrayDeque<number>()
 * deque.addFirst(1)
 * deque.addLast(2)
 * deque.removeFirst() // 1
 */
import { defaultEq } from "../utils/defaults.js";
/**
 * ArrayDeque<T> - Ring buffer implementation of Deque.
 *
 * Uses a circular array to provide O(1) operations at both ends.
 * The array grows automatically when full.
 *
 * Not thread-safe. Use synchronized() behavior for concurrent access.
 */
export class ArrayDeque {
    _elements;
    _head; // Index of first element
    _tail; // Index where next element will be added
    _eq;
    constructor(options = {}) {
        const { initialCapacity = 16, eq = defaultEq } = options;
        // Ensure capacity is a power of 2 for efficient modulo using bitwise AND
        const capacity = this.nextPowerOfTwo(Math.max(8, initialCapacity));
        this._elements = new Array(capacity);
        this._head = 0;
        this._tail = 0;
        this._eq = eq;
    }
    // ========================================================================
    // Size
    // ========================================================================
    get size() {
        // Handle wraparound: (tail - head) & mask
        return (this._tail - this._head) & (this._elements.length - 1);
    }
    get isEmpty() {
        return this._head === this._tail;
    }
    get eq() {
        return this._eq;
    }
    // ========================================================================
    // Front operations (head)
    // ========================================================================
    addFirst(element) {
        this._head = (this._head - 1) & (this._elements.length - 1);
        this._elements[this._head] = element;
        if (this._head === this._tail) {
            this.grow();
        }
    }
    offerFirst(element) {
        this.addFirst(element);
        return true;
    }
    removeFirst() {
        if (this.isEmpty) {
            throw new Error("Deque is empty");
        }
        return this.pollFirst();
    }
    pollFirst() {
        if (this.isEmpty) {
            return undefined;
        }
        const element = this._elements[this._head];
        this._elements[this._head] = undefined;
        this._head = (this._head + 1) & (this._elements.length - 1);
        return element;
    }
    peekFirst() {
        if (this.isEmpty) {
            throw new Error("Deque is empty");
        }
        return this._elements[this._head];
    }
    peekFirstOrUndefined() {
        return this.isEmpty ? undefined : this._elements[this._head];
    }
    // ========================================================================
    // Back operations (tail)
    // ========================================================================
    addLast(element) {
        this._elements[this._tail] = element;
        this._tail = (this._tail + 1) & (this._elements.length - 1);
        if (this._tail === this._head) {
            this.grow();
        }
    }
    offerLast(element) {
        this.addLast(element);
        return true;
    }
    removeLast() {
        if (this.isEmpty) {
            throw new Error("Deque is empty");
        }
        return this.pollLast();
    }
    pollLast() {
        if (this.isEmpty) {
            return undefined;
        }
        this._tail = (this._tail - 1) & (this._elements.length - 1);
        const element = this._elements[this._tail];
        this._elements[this._tail] = undefined;
        return element;
    }
    peekLast() {
        if (this.isEmpty) {
            throw new Error("Deque is empty");
        }
        const lastIndex = (this._tail - 1) & (this._elements.length - 1);
        return this._elements[lastIndex];
    }
    peekLastOrUndefined() {
        if (this.isEmpty) {
            return undefined;
        }
        const lastIndex = (this._tail - 1) & (this._elements.length - 1);
        return this._elements[lastIndex];
    }
    // ========================================================================
    // Stack operations (LIFO - use first end)
    // ========================================================================
    push(element) {
        this.addFirst(element);
    }
    pop() {
        return this.removeFirst();
    }
    // ========================================================================
    // Queue operations (FIFO - add last, remove first)
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
        for (const item of this) {
            if (this._eq(item, element)) {
                return true;
            }
        }
        return false;
    }
    containsAll(other) {
        for (const element of other) {
            if (!this.contains(element)) {
                return false;
            }
        }
        return true;
    }
    remove(element) {
        // Linear search and remove first occurrence
        let index = this._head;
        let found = false;
        for (let i = 0; i < this.size; i++) {
            if (this._eq(this._elements[index], element)) {
                found = true;
                break;
            }
            index = (index + 1) & (this._elements.length - 1);
        }
        if (!found)
            return false;
        // Remove at index by shifting elements
        const isCloserToHead = (index - this._head) &
            (this._elements.length - 1 < this._tail - index ? 1 : 0) &
            (this._elements.length - 1);
        if (isCloserToHead) {
            // Shift elements from head to index forward
            while (index !== this._head) {
                const prevIndex = (index - 1) & (this._elements.length - 1);
                this._elements[index] = this._elements[prevIndex];
                index = prevIndex;
            }
            this._elements[this._head] = undefined;
            this._head = (this._head + 1) & (this._elements.length - 1);
        }
        else {
            // Shift elements from index to tail backward
            while (index !== this._tail) {
                const nextIndex = (index + 1) & (this._elements.length - 1);
                if (nextIndex === this._tail)
                    break;
                this._elements[index] = this._elements[nextIndex];
                index = nextIndex;
            }
            this._tail = (this._tail - 1) & (this._elements.length - 1);
            this._elements[this._tail] = undefined;
        }
        return true;
    }
    removeAll(other) {
        const toRemove = new Set();
        for (const element of other) {
            toRemove.add(element);
        }
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
        const newDeque = new ArrayDeque({ eq: this._eq });
        for (const element of this) {
            let shouldRetain = false;
            for (const retainElement of toRetain) {
                if (this._eq(element, retainElement)) {
                    shouldRetain = true;
                    break;
                }
            }
            if (shouldRetain) {
                newDeque.addLast(element);
            }
        }
        const modified = newDeque.size !== this.size;
        this._elements = newDeque._elements;
        this._head = newDeque._head;
        this._tail = newDeque._tail;
        return modified;
    }
    clear() {
        // Clear all elements for GC
        let index = this._head;
        while (index !== this._tail) {
            this._elements[index] = undefined;
            index = (index + 1) & (this._elements.length - 1);
        }
        this._head = 0;
        this._tail = 0;
    }
    // ========================================================================
    // Iteration
    // ========================================================================
    *[Symbol.iterator]() {
        let index = this._head;
        while (index !== this._tail) {
            yield this._elements[index];
            index = (index + 1) & (this._elements.length - 1);
        }
    }
    forEach(action) {
        let arrayIndex = this._head;
        let logicalIndex = 0;
        while (arrayIndex !== this._tail) {
            action(this._elements[arrayIndex], logicalIndex);
            arrayIndex = (arrayIndex + 1) & (this._elements.length - 1);
            logicalIndex++;
        }
    }
    toArray() {
        const result = [];
        for (const element of this) {
            result.push(element);
        }
        return result;
    }
    // ========================================================================
    // Capacity management
    // ========================================================================
    /**
     * Doubles the capacity of the deque.
     */
    grow() {
        const oldCapacity = this._elements.length;
        const newCapacity = oldCapacity << 1; // Double capacity
        if (newCapacity < 0) {
            throw new Error("Deque too large");
        }
        const newElements = new Array(newCapacity);
        const size = this.size;
        // Copy elements from head to end of old array
        const rightSize = oldCapacity - this._head;
        for (let i = 0; i < rightSize; i++) {
            newElements[i] = this._elements[this._head + i];
        }
        // Copy wrapped elements from start of old array
        const leftSize = this._head;
        for (let i = 0; i < leftSize; i++) {
            newElements[rightSize + i] = this._elements[i];
        }
        this._elements = newElements;
        this._head = 0;
        this._tail = size;
    }
    /**
     * Returns the next power of 2 >= n.
     */
    nextPowerOfTwo(n) {
        if (n <= 0)
            return 1;
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
     * Returns the current capacity of the underlying array.
     */
    get capacity() {
        return this._elements.length;
    }
    /**
     * Returns a string representation for debugging.
     */
    toString() {
        return `ArrayDeque[${this.toArray().join(", ")}]`;
    }
}
/**
 * Factory function to create an ArrayDeque.
 *
 * @example
 * const deque = arrayDeque<number>()
 * const dequeFromArray = arrayDeque([1, 2, 3])
 * const dequeWithOptions = arrayDeque<string>({ initialCapacity: 32 })
 */
export function arrayDeque(optionsOrElements) {
    // Check if it's an iterable (not options)
    if (optionsOrElements && Symbol.iterator in optionsOrElements) {
        const deque = new ArrayDeque();
        deque.addAll(optionsOrElements);
        return deque;
    }
    return new ArrayDeque(optionsOrElements);
}
//# sourceMappingURL=array-deque.js.map