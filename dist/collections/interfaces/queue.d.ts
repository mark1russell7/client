/**
 * Queue and Deque interfaces that mirror Java's Queue and Deque.
 *
 * Queues are collections designed for holding elements prior to processing.
 * Deques (double-ended queues) allow efficient insertion/removal at both ends.
 */
import type { Collection, ReadonlyCollection } from "./collection.js";
import type { Compare } from "../core/traits.js";
/**
 * ReadonlyQueue<T> - Readonly FIFO (First-In-First-Out) queue.
 *
 * Provides read-only access to queue operations.
 */
export interface ReadonlyQueue<T> extends ReadonlyCollection<T> {
    /**
     * Retrieves, but does not remove, the head of this queue.
     *
     * @returns The head element
     * @throws Error if queue is empty
     */
    peek(): T;
    /**
     * Returns the head element without throwing if empty.
     * Returns undefined if queue is empty.
     */
    peekOrUndefined(): T | undefined;
}
/**
 * Queue<T> - FIFO (First-In-First-Out) queue.
 *
 * Mirrors java.util.Queue.
 * Elements are processed in the order they were added.
 */
export interface Queue<T> extends ReadonlyQueue<T>, Collection<T> {
    /**
     * Inserts an element into the queue.
     * For bounded queues with overflow='throw', throws if queue is full.
     *
     * @param element The element to add
     * @returns true if element was added
     * @throws Error if queue is full (bounded with throw policy)
     */
    offer(element: T): boolean;
    /**
     * Retrieves and removes the head of this queue.
     *
     * @returns The head element
     * @throws Error if queue is empty
     */
    poll(): T;
    /**
     * Retrieves and removes the head of this queue, or returns undefined if empty.
     */
    pollOrUndefined(): T | undefined;
    /**
     * Alias for offer(). Adds element to end of queue.
     * Included for consistency with standard queue terminology.
     */
    enqueue(element: T): boolean;
    /**
     * Alias for poll(). Removes and returns element from front of queue.
     * Included for consistency with standard queue terminology.
     */
    dequeue(): T;
}
/**
 * Deque<T> - Double-ended queue.
 *
 * Mirrors java.util.Deque.
 * Supports insertion and removal at both ends.
 * Can be used as a queue (FIFO) or stack (LIFO).
 */
export interface Deque<T> extends Queue<T> {
    /**
     * Inserts element at the front of this deque.
     *
     * @param element The element to add
     * @throws Error if deque is full (bounded with throw policy)
     */
    addFirst(element: T): void;
    /**
     * Inserts element at the front, returning false if full.
     */
    offerFirst(element: T): boolean;
    /**
     * Retrieves and removes the first element.
     *
     * @throws Error if deque is empty
     */
    removeFirst(): T;
    /**
     * Retrieves and removes the first element, or undefined if empty.
     */
    pollFirst(): T | undefined;
    /**
     * Retrieves but does not remove the first element.
     *
     * @throws Error if deque is empty
     */
    peekFirst(): T;
    /**
     * Retrieves but does not remove the first element, or undefined if empty.
     */
    peekFirstOrUndefined(): T | undefined;
    /**
     * Inserts element at the end of this deque.
     *
     * @param element The element to add
     * @throws Error if deque is full (bounded with throw policy)
     */
    addLast(element: T): void;
    /**
     * Inserts element at the end, returning false if full.
     */
    offerLast(element: T): boolean;
    /**
     * Retrieves and removes the last element.
     *
     * @throws Error if deque is empty
     */
    removeLast(): T;
    /**
     * Retrieves and removes the last element, or undefined if empty.
     */
    pollLast(): T | undefined;
    /**
     * Retrieves but does not remove the last element.
     *
     * @throws Error if deque is empty
     */
    peekLast(): T;
    /**
     * Retrieves but does not remove the last element, or undefined if empty.
     */
    peekLastOrUndefined(): T | undefined;
    /**
     * Pushes element onto the stack represented by this deque.
     * Equivalent to addFirst().
     *
     * @param element The element to push
     */
    push(element: T): void;
    /**
     * Pops an element from the stack represented by this deque.
     * Equivalent to removeFirst().
     *
     * @returns The popped element
     * @throws Error if deque is empty
     */
    pop(): T;
}
/**
 * BlockingQueue<T> - Queue that supports blocking operations.
 *
 * Mirrors java.util.concurrent.BlockingQueue.
 * Useful for producer-consumer patterns.
 */
export interface BlockingQueue<T> extends Queue<T> {
    /**
     * Inserts element, waiting if necessary for space to become available.
     *
     * @param element The element to add
     * @param timeoutMs Optional timeout in milliseconds
     * @returns Promise that resolves to true when element is added
     * @throws Error if timeout expires
     */
    put(element: T, timeoutMs?: number): Promise<void>;
    /**
     * Retrieves and removes the head, waiting if necessary until an element is available.
     *
     * @param timeoutMs Optional timeout in milliseconds
     * @returns Promise that resolves to the head element
     * @throws Error if timeout expires
     */
    take(timeoutMs?: number): Promise<T>;
    /**
     * Returns the remaining capacity.
     * Returns Infinity for unbounded queues.
     */
    readonly remainingCapacity: number;
    /**
     * Removes all available elements and adds them to the given array.
     * Returns the number of elements transferred.
     */
    drainTo(target: T[], maxElements?: number): number;
}
/**
 * PriorityQueue<T> - Queue that orders elements by priority.
 *
 * Mirrors java.util.PriorityQueue.
 * Elements are removed in priority order (not insertion order).
 * Requires a comparison function to determine priority.
 */
export interface PriorityQueue<T> extends Queue<T> {
    /**
     * The comparison function used to determine priority.
     * Elements with lower compare value have higher priority.
     */
    readonly compare: Compare<T>;
    /**
     * Returns the comparator used to order elements, or undefined if natural ordering.
     */
    readonly comparator: Compare<T> | undefined;
}
/**
 * AsyncQueue<T> - Async iterable queue.
 *
 * Designed for async/await patterns and streaming data.
 * Implements AsyncIterable for use with for-await-of loops.
 */
export interface AsyncQueue<T> extends AsyncIterable<T> {
    /** Number of elements currently in queue */
    readonly size: number;
    /** True if queue is empty */
    readonly isEmpty: boolean;
    /**
     * Adds element to queue.
     * For bounded queues, may wait for space to become available.
     */
    put(element: T): Promise<void>;
    /**
     * Removes and returns next element.
     * Waits for an element if queue is empty.
     */
    take(): Promise<T>;
    /**
     * Attempts to add element without waiting.
     * Returns false if queue is full.
     */
    tryPut(element: T): boolean;
    /**
     * Attempts to remove element without waiting.
     * Returns undefined if queue is empty.
     */
    tryTake(): T | undefined;
    /**
     * Returns next element without removing it.
     * Waits for an element if queue is empty.
     */
    peek(): Promise<T>;
    /**
     * Closes the queue, preventing further additions.
     * Allows existing elements to be consumed.
     */
    close(): void;
    /**
     * Returns true if queue is closed.
     */
    readonly isClosed: boolean;
}
/**
 * TransferQueue<T> - Queue where producers can wait for consumers.
 *
 * Mirrors java.util.concurrent.TransferQueue.
 * Useful for direct handoff between producer and consumer threads.
 */
export interface TransferQueue<T> extends BlockingQueue<T> {
    /**
     * Transfers element to consumer, waiting if necessary.
     * Waits for a consumer to receive the element.
     *
     * @param element The element to transfer
     * @returns Promise that resolves when element is received
     */
    transfer(element: T): Promise<void>;
    /**
     * Attempts to transfer element to waiting consumer.
     * Returns false immediately if no consumer is waiting.
     *
     * @param element The element to transfer
     * @param timeoutMs Optional timeout in milliseconds
     */
    tryTransfer(element: T, timeoutMs?: number): Promise<boolean>;
    /**
     * Returns true if there are consumers waiting to receive elements.
     */
    readonly hasWaitingConsumer: boolean;
    /**
     * Returns an estimate of the number of consumers waiting to receive elements.
     */
    readonly waitingConsumerCount: number;
}
/**
 * DelayQueue<T> - Queue where elements become available after a delay.
 *
 * Mirrors java.util.concurrent.DelayQueue.
 * Elements can only be removed once their delay has expired.
 */
export interface DelayQueue<T> extends BlockingQueue<T> {
    /**
     * Adds element with specified delay.
     *
     * @param element The element to add
     * @param delayMs Delay in milliseconds before element becomes available (defaults to 0)
     */
    offer(element: T, delayMs?: number): boolean;
    /**
     * Returns the delay (in ms) until next element becomes available.
     * Returns 0 if element is ready now.
     * Returns Infinity if queue is empty.
     */
    readonly nextDelay: number;
}
//# sourceMappingURL=queue.d.ts.map