/**
 * PriorityQueue implementation - A binary heap-based priority queue.
 *
 * Elements are ordered according to their natural ordering (via comparator).
 * The head of the queue is the least element according to the comparator.
 * Provides O(log n) enqueue and O(log n) dequeue operations.
 * Mirrors java.util.PriorityQueue.
 *
 * @example
 * const pq = priorityQueue<number>((a, b) => a - b) // Min heap
 * pq.offer(5)
 * pq.offer(2)
 * pq.offer(8)
 * pq.poll() // 2 (smallest element)
 */
import { defaultEq, defaultCompare } from "../utils/defaults.js";
/**
 * PriorityQueue<T> - Binary heap implementation of priority queue.
 *
 * Elements are always retrieved in priority order (according to comparator).
 * Not a FIFO queue - order depends on priority, not insertion order.
 *
 * The heap is a min heap by default (smallest element has highest priority).
 * For max heap, use reversed comparator: (a, b) => compare(b, a)
 *
 * Not thread-safe. Use synchronized() behavior for concurrent access.
 */
export class PriorityQueue {
    _heap;
    _compare;
    _eq;
    constructor(options = {}) {
        const { initialCapacity = 11, compare = defaultCompare, eq = defaultEq, } = options;
        this._heap = new Array(initialCapacity);
        this._compare = compare;
        this._eq = eq;
    }
    // ========================================================================
    // Size
    // ========================================================================
    get size() {
        return this._heap.length;
    }
    get isEmpty() {
        return this._heap.length === 0;
    }
    get eq() {
        return this._eq;
    }
    get compare() {
        return this._compare;
    }
    get comparator() {
        return this._compare;
    }
    // ========================================================================
    // Priority queue operations
    // ========================================================================
    offer(element) {
        this._heap.push(element);
        this.bubbleUp(this._heap.length - 1);
        return true;
    }
    poll() {
        if (this.isEmpty) {
            throw new Error("Priority queue is empty");
        }
        return this.pollOrUndefined();
    }
    pollOrUndefined() {
        if (this.isEmpty) {
            return undefined;
        }
        const result = this._heap[0];
        if (this._heap.length === 1) {
            this._heap.pop();
        }
        else {
            this._heap[0] = this._heap.pop();
            this.bubbleDown(0);
        }
        return result;
    }
    peek() {
        if (this.isEmpty) {
            throw new Error("Priority queue is empty");
        }
        return this._heap[0];
    }
    peekOrUndefined() {
        return this.isEmpty ? undefined : this._heap[0];
    }
    // ========================================================================
    // Queue interface compatibility
    // ========================================================================
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
        return this.offer(element);
    }
    addAll(other) {
        let modified = false;
        for (const element of other) {
            this.offer(element);
            modified = true;
        }
        return modified;
    }
    contains(element) {
        for (const item of this._heap) {
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
        const index = this._heap.findIndex((item) => this._eq(item, element));
        if (index === -1) {
            return false;
        }
        if (index === this._heap.length - 1) {
            this._heap.pop();
        }
        else {
            this._heap[index] = this._heap.pop();
            this.bubbleDown(index);
            this.bubbleUp(index);
        }
        return true;
    }
    removeAll(other) {
        let modified = false;
        for (const element of other) {
            while (this.remove(element)) {
                modified = true;
            }
        }
        return modified;
    }
    retainAll(other) {
        const toRetain = new Set(other);
        const newHeap = [];
        for (const element of this._heap) {
            let shouldRetain = false;
            for (const retainElement of toRetain) {
                if (this._eq(element, retainElement)) {
                    shouldRetain = true;
                    break;
                }
            }
            if (shouldRetain) {
                newHeap.push(element);
            }
        }
        const modified = newHeap.length !== this._heap.length;
        this._heap = newHeap;
        this.heapify();
        return modified;
    }
    clear() {
        this._heap = [];
    }
    // ========================================================================
    // Iteration
    // ========================================================================
    /**
     * Iterator returns elements in arbitrary order (not priority order).
     * To get elements in priority order, repeatedly call poll().
     */
    *[Symbol.iterator]() {
        yield* this._heap;
    }
    forEach(action) {
        this._heap.forEach((element, index) => action(element, index));
    }
    /**
     * Returns elements in arbitrary heap order (not sorted).
     */
    toArray() {
        return this._heap.slice();
    }
    /**
     * Returns elements in priority order (sorted).
     * This is a destructive operation that drains the queue.
     */
    toSortedArray() {
        const result = [];
        const clone = this.clone();
        while (!clone.isEmpty) {
            result.push(clone.poll());
        }
        return result;
    }
    // ========================================================================
    // Heap operations
    // ========================================================================
    /**
     * Bubbles an element up the heap to maintain heap property.
     */
    bubbleUp(index) {
        const element = this._heap[index];
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            const parent = this._heap[parentIndex];
            if (this._compare(element, parent) >= 0) {
                break;
            }
            this._heap[index] = parent;
            index = parentIndex;
        }
        this._heap[index] = element;
    }
    /**
     * Bubbles an element down the heap to maintain heap property.
     */
    bubbleDown(index) {
        const length = this._heap.length;
        const element = this._heap[index];
        while (true) {
            const leftChildIndex = 2 * index + 1;
            const rightChildIndex = 2 * index + 2;
            let smallestIndex = index;
            if (leftChildIndex < length &&
                this._compare(this._heap[leftChildIndex], this._heap[smallestIndex]) < 0) {
                smallestIndex = leftChildIndex;
            }
            if (rightChildIndex < length &&
                this._compare(this._heap[rightChildIndex], this._heap[smallestIndex]) < 0) {
                smallestIndex = rightChildIndex;
            }
            if (smallestIndex === index) {
                break;
            }
            this._heap[index] = this._heap[smallestIndex];
            index = smallestIndex;
        }
        this._heap[index] = element;
    }
    /**
     * Rebuilds the heap from an arbitrary array.
     * Uses Floyd's algorithm (O(n) time).
     */
    heapify() {
        // Start from last non-leaf node and bubble down
        for (let i = Math.floor(this._heap.length / 2) - 1; i >= 0; i--) {
            this.bubbleDown(i);
        }
    }
    // ========================================================================
    // Utility methods
    // ========================================================================
    /**
     * Creates a shallow copy of this priority queue.
     */
    clone() {
        const clone = new PriorityQueue({
            compare: this._compare,
            eq: this._eq,
        });
        clone._heap = this._heap.slice();
        return clone;
    }
    /**
     * Validates the heap property (for debugging).
     * Returns true if the heap is valid.
     */
    validate() {
        for (let i = 0; i < this._heap.length; i++) {
            const leftChildIndex = 2 * i + 1;
            const rightChildIndex = 2 * i + 2;
            if (leftChildIndex < this._heap.length &&
                this._compare(this._heap[i], this._heap[leftChildIndex]) > 0) {
                return false;
            }
            if (rightChildIndex < this._heap.length &&
                this._compare(this._heap[i], this._heap[rightChildIndex]) > 0) {
                return false;
            }
        }
        return true;
    }
    /**
     * Returns a string representation for debugging.
     */
    toString() {
        return `PriorityQueue[${this._heap.join(", ")}]`;
    }
}
/**
 * Factory function to create a PriorityQueue.
 *
 * @example
 * // Min heap (default)
 * const minHeap = priorityQueue<number>()
 *
 * // Max heap
 * const maxHeap = priorityQueue<number>((a, b) => b - a)
 *
 * // From array
 * const pq = priorityQueue([5, 2, 8, 1, 9])
 *
 * // With custom comparator
 * const pq = priorityQueue<Task>((a, b) => a.priority - b.priority)
 */
export function priorityQueue(optionsOrElementsOrComparator) {
    // If it's a function, treat it as a comparator
    if (typeof optionsOrElementsOrComparator === "function") {
        return new PriorityQueue({
            compare: optionsOrElementsOrComparator,
        });
    }
    // Check if it's an iterable (not options)
    if (optionsOrElementsOrComparator && Symbol.iterator in optionsOrElementsOrComparator) {
        const pq = new PriorityQueue();
        pq.addAll(optionsOrElementsOrComparator);
        return pq;
    }
    return new PriorityQueue(optionsOrElementsOrComparator);
}
//# sourceMappingURL=priority-queue.js.map