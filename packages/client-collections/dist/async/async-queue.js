/**
 * AsyncQueue - An async iterable queue with backpressure support.
 *
 * Designed for producer-consumer patterns where producers can wait when
 * the queue is full and consumers can wait when the queue is empty.
 * Implements AsyncIterable for use with for-await-of loops.
 *
 * @example
 * const queue = asyncQueue<number>({ capacity: 10 })
 *
 * // Producer
 * await queue.put(42) // Waits if queue is full
 *
 * // Consumer
 * const value = await queue.take() // Waits if queue is empty
 *
 * // Async iteration
 * for await (const value of queue) {
 *   console.log(value)
 * }
 */
/**
 * AsyncQueue<T> - Thread-safe async queue with backpressure.
 *
 * Features:
 * - Blocking put() when full (backpressure)
 * - Blocking take() when empty
 * - AsyncIterable support
 * - Graceful closing
 * - Timeouts
 *
 * Perfect for:
 * - Producer-consumer patterns
 * - Rate limiting
 * - Task queues
 * - Stream processing
 */
export class AsyncQueue {
    buffer = [];
    putters = [];
    takers = [];
    _isClosed = false;
    capacity;
    defaultTimeout;
    constructor(options = {}) {
        this.capacity = options.capacity ?? Infinity;
        if (options.timeout !== undefined) {
            this.defaultTimeout = options.timeout;
        }
    }
    // ========================================================================
    // Size and state
    // ========================================================================
    get size() {
        return this.buffer.length;
    }
    get isEmpty() {
        return this.buffer.length === 0;
    }
    get isFull() {
        return this.buffer.length >= this.capacity;
    }
    get isClosed() {
        return this._isClosed;
    }
    get remainingCapacity() {
        return this.capacity === Infinity ? Infinity : this.capacity - this.buffer.length;
    }
    // ========================================================================
    // Blocking operations
    // ========================================================================
    /**
     * Adds an element to the queue.
     * If the queue is full, waits until space is available.
     *
     * @throws Error if queue is closed
     * @throws Error if timeout expires
     */
    async put(element, timeout) {
        if (this._isClosed) {
            throw new Error("Queue is closed");
        }
        // If there are waiting takers, give to them directly
        if (this.takers.length > 0) {
            const taker = this.takers.shift();
            this.clearTimeout(taker);
            taker.resolve(element);
            return;
        }
        // If queue has space, add immediately
        if (this.buffer.length < this.capacity) {
            this.buffer.push(element);
            return;
        }
        // Queue is full, wait for space
        return new Promise((resolve, reject) => {
            const putter = { resolve, reject };
            const timeoutMs = timeout ?? this.defaultTimeout;
            if (timeoutMs !== undefined) {
                putter.timeoutId = setTimeout(() => {
                    const index = this.putters.indexOf(putter);
                    if (index !== -1) {
                        this.putters.splice(index, 1);
                    }
                    reject(new Error(`Put timeout after ${timeoutMs}ms`));
                }, timeoutMs);
            }
            this.putters.push(putter);
            // Immediately try to resolve if a taker arrives
            if (this.takers.length > 0) {
                const taker = this.takers.shift();
                this.clearTimeout(taker);
                this.clearTimeout(putter);
                this.putters.pop(); // Remove putter
                taker.resolve(element);
                resolve();
            }
            else if (this.buffer.length < this.capacity) {
                this.clearTimeout(putter);
                this.putters.pop();
                this.buffer.push(element);
                resolve();
            }
        });
    }
    /**
     * Removes and returns an element from the queue.
     * If the queue is empty, waits until an element is available.
     *
     * @throws Error if queue is closed and empty
     * @throws Error if timeout expires
     */
    async take(timeout) {
        // If buffer has elements, return immediately
        if (this.buffer.length > 0) {
            const element = this.buffer.shift();
            this.fulfillPutter();
            return element;
        }
        // If closed and empty, throw
        if (this._isClosed) {
            throw new Error("Queue is closed and empty");
        }
        // Wait for an element
        return new Promise((resolve, reject) => {
            const taker = { resolve, reject };
            const timeoutMs = timeout ?? this.defaultTimeout;
            if (timeoutMs !== undefined) {
                taker.timeoutId = setTimeout(() => {
                    const index = this.takers.indexOf(taker);
                    if (index !== -1) {
                        this.takers.splice(index, 1);
                    }
                    reject(new Error(`Take timeout after ${timeoutMs}ms`));
                }, timeoutMs);
            }
            this.takers.push(taker);
            // Check if putter can immediately fulfill
            if (this.putters.length > 0 || this.buffer.length > 0) {
                const t = this.takers.pop();
                this.clearTimeout(t);
                if (this.buffer.length > 0) {
                    const element = this.buffer.shift();
                    this.fulfillPutter();
                    resolve(element);
                }
                else if (this.putters.length > 0) {
                    // Direct handoff from putter
                    const putter = this.putters.shift();
                    this.clearTimeout(putter);
                    putter.resolve();
                }
            }
        });
    }
    // ========================================================================
    // Non-blocking operations
    // ========================================================================
    /**
     * Attempts to add an element without waiting.
     * Returns false if queue is full.
     */
    tryPut(element) {
        if (this._isClosed || this.buffer.length >= this.capacity) {
            return false;
        }
        // If there are waiting takers, give to them directly
        if (this.takers.length > 0) {
            const taker = this.takers.shift();
            this.clearTimeout(taker);
            taker.resolve(element);
            return true;
        }
        this.buffer.push(element);
        return true;
    }
    /**
     * Attempts to remove an element without waiting.
     * Returns undefined if queue is empty.
     */
    tryTake() {
        if (this.buffer.length === 0) {
            return undefined;
        }
        const element = this.buffer.shift();
        this.fulfillPutter();
        return element;
    }
    // ========================================================================
    // Peeking
    // ========================================================================
    /**
     * Returns the next element without removing it.
     * Waits if queue is empty.
     */
    async peek() {
        if (this.buffer.length > 0) {
            return this.buffer[0];
        }
        if (this._isClosed) {
            throw new Error("Queue is closed and empty");
        }
        // Wait for an element, then peek
        const element = await this.take();
        this.buffer.unshift(element);
        return element;
    }
    /**
     * Returns the next element without waiting.
     * Returns undefined if queue is empty.
     */
    tryPeek() {
        return this.buffer[0];
    }
    // ========================================================================
    // Closing and draining
    // ========================================================================
    /**
     * Closes the queue. No more elements can be added.
     * Existing elements can still be consumed.
     */
    close() {
        this._isClosed = true;
        // Reject all waiting putters
        for (const putter of this.putters) {
            this.clearTimeout(putter);
            putter.reject(new Error("Queue closed"));
        }
        this.putters = [];
        // Wake up takers if queue is empty
        if (this.buffer.length === 0) {
            for (const taker of this.takers) {
                this.clearTimeout(taker);
                taker.reject(new Error("Queue closed and empty"));
            }
            this.takers = [];
        }
    }
    /**
     * Drains all elements into an array.
     * Returns immediately with current elements.
     */
    drain() {
        const elements = this.buffer.slice();
        this.buffer = [];
        // Fulfill all waiting putters
        while (this.putters.length > 0) {
            this.fulfillPutter();
        }
        return elements;
    }
    // ========================================================================
    // Async iteration
    // ========================================================================
    /**
     * Async iterator that yields elements as they become available.
     * Stops when queue is closed and empty.
     */
    async *[Symbol.asyncIterator]() {
        while (true) {
            if (this.buffer.length > 0) {
                yield this.buffer.shift();
                this.fulfillPutter();
            }
            else if (this._isClosed) {
                break;
            }
            else {
                try {
                    yield await this.take();
                }
                catch (e) {
                    // Queue was closed
                    break;
                }
            }
        }
    }
    // ========================================================================
    // Private helpers
    // ========================================================================
    fulfillPutter() {
        if (this.putters.length > 0 && this.buffer.length < this.capacity) {
            const putter = this.putters.shift();
            this.clearTimeout(putter);
            putter.resolve();
        }
    }
    clearTimeout(resolver) {
        if (resolver.timeoutId) {
            clearTimeout(resolver.timeoutId);
        }
    }
    // ========================================================================
    // Utility methods
    // ========================================================================
    /**
     * Returns statistics about the queue.
     */
    getStats() {
        return {
            size: this.size,
            capacity: this.capacity,
            isEmpty: this.isEmpty,
            isFull: this.isFull,
            isClosed: this._isClosed,
            waitingPutters: this.putters.length,
            waitingTakers: this.takers.length,
            remainingCapacity: this.remainingCapacity,
        };
    }
    toString() {
        return `AsyncQueue[size=${this.size}, capacity=${this.capacity}, closed=${this._isClosed}]`;
    }
}
/**
 * Factory function to create an AsyncQueue.
 *
 * @example
 * const queue = asyncQueue<number>({ capacity: 100 })
 * await queue.put(42)
 * const value = await queue.take()
 */
export function asyncQueue(options) {
    return new AsyncQueue(options);
}
//# sourceMappingURL=async-queue.js.map