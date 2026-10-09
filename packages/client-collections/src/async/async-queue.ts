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
 * Resolver for waiting operations.
 */
interface Resolver<T> {
  resolve: (value: T) => void;
  reject: (reason: any) => void;
  timeoutId?: ReturnType<typeof setTimeout>;
}

/** A waiting put: it keeps its element until the queue takes it. */
interface Putter<T> extends Resolver<void> {
  element: T;
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
export class AsyncQueue<T> implements IAsyncQueue<T> {
  private buffer: T[] = [];
  private putters: Putter<T>[] = [];
  private takers: Resolver<T>[] = [];
  private _isClosed = false;
  private readonly capacity: number;
  private readonly defaultTimeout?: number;

  constructor(options: AsyncQueueOptions = {}) {
    this.capacity = options.capacity ?? Infinity;
    if (options.timeout !== undefined) {
      this.defaultTimeout = options.timeout;
    }
  }

  // ========================================================================
  // Size and state
  // ========================================================================

  get size(): number {
    return this.buffer.length;
  }

  get isEmpty(): boolean {
    return this.buffer.length === 0;
  }

  get isFull(): boolean {
    return this.buffer.length >= this.capacity;
  }

  get isClosed(): boolean {
    return this._isClosed;
  }

  get remainingCapacity(): number {
    return this.capacity === Infinity ? Infinity : this.capacity - this.buffer.length;
  }

  // ========================================================================
  // Blocking operations
  // ========================================================================

  /**
   * Adds an element to the queue.
   * If the queue is full, waits until space is available. With a capacity of 0, it waits until
   * a taker takes the element (a rendezvous).
   *
   * @throws Error if queue is closed
   * @throws Error if timeout expires
   */
  async put(element: T, timeout?: number): Promise<void> {
    if (this._isClosed) {
      throw new Error("Queue is closed");
    }
    if (this.tryPutNow(element)) {
      return;
    }

    // Queue is full: wait with the element. (Before, a waiting putter kept only its resolve
    // function, so its element was dropped when space came: BUGS-2026-07 C11.)
    return new Promise<void>((resolve, reject) => {
      const putter: Putter<T> = { element, resolve, reject };
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
    });
  }

  /**
   * Removes and returns an element from the queue.
   * If the queue is empty, waits until an element is available.
   *
   * @throws Error if queue is closed and empty
   * @throws Error if timeout expires
   */
  async take(timeout?: number): Promise<T> {
    const next = this.takeNow();
    if (next.found) {
      return next.element;
    }

    // If closed and empty, throw
    if (this._isClosed) {
      throw new Error("Queue is closed and empty");
    }

    // Wait for an element
    return new Promise<T>((resolve, reject) => {
      const taker: Resolver<T> = { resolve, reject };
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
    });
  }

  // ========================================================================
  // Non-blocking operations
  // ========================================================================

  /**
   * Attempts to add an element without waiting.
   * Returns false if queue is full (with a capacity of 0: if no taker waits).
   */
  tryPut(element: T): boolean {
    if (this._isClosed) {
      return false;
    }
    return this.tryPutNow(element);
  }

  /**
   * Attempts to remove an element without waiting.
   * Returns undefined if queue is empty.
   */
  tryTake(): T | undefined {
    const next = this.takeNow();
    return next.found ? next.element : undefined;
  }

  /** Gives the element to a waiting taker, or puts it in the buffer when there is space. */
  private tryPutNow(element: T): boolean {
    // A waiting taker gets the element directly (the buffer is empty when a taker waits)
    const taker = this.takers.shift();
    if (taker) {
      this.clearTimeout(taker);
      taker.resolve(element);
      return true;
    }
    if (this.buffer.length < this.capacity) {
      this.buffer.push(element);
      return true;
    }
    return false;
  }

  /**
   * Takes the next element: from the buffer (then a waiting putter moves its element into the
   * buffer), or directly from a waiting putter (a capacity of 0). (Before, the direct path
   * released the putter but never gave its element to the taker, so the taker waited forever:
   * BUGS-2026-07 C11.)
   */
  private takeNow(): { found: true; element: T } | { found: false } {
    if (this.buffer.length > 0) {
      const element = this.buffer.shift()!;
      this.admitPutter();
      return { found: true, element };
    }
    const putter = this.putters.shift();
    if (putter) {
      this.clearTimeout(putter);
      putter.resolve();
      return { found: true, element: putter.element };
    }
    return { found: false };
  }

  // ========================================================================
  // Peeking
  // ========================================================================

  /**
   * Returns the next element without removing it.
   * Waits if queue is empty.
   */
  async peek(): Promise<T> {
    if (this.buffer.length > 0) {
      return this.buffer[0]!;
    }
    if (this.putters.length > 0) {
      return this.putters[0]!.element;
    }

    if (this._isClosed) {
      throw new Error("Queue is closed and empty");
    }

    // Wait for an element, then put it back at the front
    const element = await this.take();
    this.buffer.unshift(element);
    return element;
  }

  /**
   * Returns the next element without waiting.
   * Returns undefined if queue is empty.
   */
  tryPeek(): T | undefined {
    return this.buffer.length > 0 ? this.buffer[0] : this.putters[0]?.element;
  }

  // ========================================================================
  // Closing and draining
  // ========================================================================

  /**
   * Closes the queue. No more elements can be added.
   * Existing elements can still be consumed.
   */
  close(): void {
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
  drain(): T[] {
    // The buffer, then the elements of the waiting putters, in order. (Before, the waiting
    // putters were released but their elements were dropped.)
    const elements = this.buffer.slice();
    this.buffer = [];
    for (const putter of this.putters.splice(0)) {
      this.clearTimeout(putter);
      putter.resolve();
      elements.push(putter.element);
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
  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (true) {
      const next = this.takeNow();
      if (next.found) {
        yield next.element;
      } else if (this._isClosed) {
        break;
      } else {
        let element: T;
        try {
          element = await this.take();
        } catch (error) {
          // The queue was closed while the iterator waited
          if (this._isClosed) break;
          throw error;
        }
        yield element;
      }
    }
  }

  // ========================================================================
  // Private helpers
  // ========================================================================

  /** When the buffer has space, the first waiting putter moves its element into it. */
  private admitPutter(): void {
    if (this.putters.length > 0 && this.buffer.length < this.capacity) {
      const putter = this.putters.shift()!;
      this.clearTimeout(putter);
      this.buffer.push(putter.element);
      putter.resolve();
    }
  }

  private clearTimeout(resolver: Resolver<any>): void {
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
  getStats() : {
    size: number;
    capacity: number;
    isEmpty: boolean;
    isFull: boolean;
    isClosed: boolean;
    waitingPutters: number;
    waitingTakers: number;
    remainingCapacity: number;
  } {
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

  toString(): string {
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
export function asyncQueue<T>(options?: AsyncQueueOptions): AsyncQueue<T> {
  return new AsyncQueue<T>(options);
}
