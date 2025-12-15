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
import type { AsyncQueue as IAsyncQueue } from "../interfaces/queue.js";
/**
 * Options for creating an AsyncQueue.
 */
export interface AsyncQueueOptions {
    /**
     * Maximum capacity. Infinity for unbounded queue.
     * @default Infinity
     */
    capacity?: number;
    /**
     * Timeout for put/take operations in milliseconds.
     * @default undefined (no timeout)
     */
    timeout?: number;
}
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
export declare class AsyncQueue<T> implements IAsyncQueue<T> {
    private buffer;
    private putters;
    private takers;
    private _isClosed;
    private readonly capacity;
    private readonly defaultTimeout?;
    constructor(options?: AsyncQueueOptions);
    get size(): number;
    get isEmpty(): boolean;
    get isFull(): boolean;
    get isClosed(): boolean;
    get remainingCapacity(): number;
    /**
     * Adds an element to the queue.
     * If the queue is full, waits until space is available.
     *
     * @throws Error if queue is closed
     * @throws Error if timeout expires
     */
    put(element: T, timeout?: number): Promise<void>;
    /**
     * Removes and returns an element from the queue.
     * If the queue is empty, waits until an element is available.
     *
     * @throws Error if queue is closed and empty
     * @throws Error if timeout expires
     */
    take(timeout?: number): Promise<T>;
    /**
     * Attempts to add an element without waiting.
     * Returns false if queue is full.
     */
    tryPut(element: T): boolean;
    /**
     * Attempts to remove an element without waiting.
     * Returns undefined if queue is empty.
     */
    tryTake(): T | undefined;
    /**
     * Returns the next element without removing it.
     * Waits if queue is empty.
     */
    peek(): Promise<T>;
    /**
     * Returns the next element without waiting.
     * Returns undefined if queue is empty.
     */
    tryPeek(): T | undefined;
    /**
     * Closes the queue. No more elements can be added.
     * Existing elements can still be consumed.
     */
    close(): void;
    /**
     * Drains all elements into an array.
     * Returns immediately with current elements.
     */
    drain(): T[];
    /**
     * Async iterator that yields elements as they become available.
     * Stops when queue is closed and empty.
     */
    [Symbol.asyncIterator](): AsyncIterator<T>;
    private fulfillPutter;
    private clearTimeout;
    /**
     * Returns statistics about the queue.
     */
    getStats(): {
        size: number;
        capacity: number;
        isEmpty: boolean;
        isFull: boolean;
        isClosed: boolean;
        waitingPutters: number;
        waitingTakers: number;
        remainingCapacity: number;
    };
    toString(): string;
}
/**
 * Factory function to create an AsyncQueue.
 *
 * @example
 * const queue = asyncQueue<number>({ capacity: 100 })
 * await queue.put(42)
 * const value = await queue.take()
 */
export declare function asyncQueue<T>(options?: AsyncQueueOptions): AsyncQueue<T>;
//# sourceMappingURL=async-queue.d.ts.map