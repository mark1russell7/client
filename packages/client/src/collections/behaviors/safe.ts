/**
 * Safe behavior - Provides Option/Result-based error handling.
 *
 * Wraps collection operations that throw errors to instead return
 * Option<T> or Result<T, E>, enabling functional error handling.
 *
 * @example
 * const list = compose(
 *   safeList()
 * )(arrayList<number>())
 *
 * const value = list.safe.get(10) // Option<number> instead of throwing
 * if (isSome(value)) {
 *   console.log(value.value)
 * }
 */

import type { Middleware } from "../core/middleware.js";
import type { List } from "../interfaces/list.js";
import type { Queue, Deque } from "../interfaces/queue.js";
import type { MapLike } from "../interfaces/map.js";
import { type Option, type Result } from "../core/effects.js";
import { None, Some, tryCatch } from "../core/effects.js";

/**
 * Safe operations for List.
 */
export interface SafeListOperations<T> {
  /**
   * Get element at index, returning Option.
   */
  get(index: number): Option<T>;

  /**
   * Set element at index, returning Result with old value or error.
   */
  set(index: number, element: T): Result<T, string>;

  /**
   * Remove element at index, returning Result with removed value or error.
   */
  removeAt(index: number): Result<T, string>;

  /**
   * Get first element as Option.
   */
  first(): Option<T>;

  /**
   * Get last element as Option.
   */
  last(): Option<T>;

  /**
   * Pop element, returning Option.
   */
  pop(): Option<T>;

  /**
   * Shift element, returning Option.
   */
  shift(): Option<T>;
}

/**
 * Safe operations for Queue.
 */
export interface SafeQueueOperations<T> {
  /**
   * Peek at head element as Option.
   */
  peek(): Option<T>;

  /**
   * Poll element as Option.
   */
  poll(): Option<T>;

  /**
   * Dequeue element as Option.
   */
  dequeue(): Option<T>;
}

/**
 * Safe operations for Deque.
 */
export interface SafeDequeOperations<T> extends SafeQueueOperations<T> {
  /**
   * Peek at first element as Option.
   */
  peekFirst(): Option<T>;

  /**
   * Peek at last element as Option.
   */
  peekLast(): Option<T>;

  /**
   * Poll first element as Option.
   */
  pollFirst(): Option<T>;

  /**
   * Poll last element as Option.
   */
  pollLast(): Option<T>;

  /**
   * Pop element as Option.
   */
  pop(): Option<T>;
}

/**
 * Safe operations for Map.
 */
export interface SafeMapOperations<K, V> {
  /**
   * Get value for key as Option.
   */
  get(key: K): Option<V>;

  /**
   * Set value for key, returning Result with old value or success.
   */
  set(key: K, value: V): Result<V | undefined, string>;

  /**
   * Delete key, returning Result with deleted value or error.
   */
  delete(key: K): Result<V | undefined, string>;
}

/**
 * Creates a safe List middleware.
 *
 * Exposes a `safe` property with Option/Result-based operations.
 */
export function safeList<T>(): Middleware<
  List<T> & { safe: SafeListOperations<T> }
> {
  return (next: List<T>): List<T> & { safe: SafeListOperations<T> } => {
    const safe: SafeListOperations<T> = {
      get(index: number): Option<T> {
        return tryCatch(
          () => next.get(index),
          () => "Index out of bounds"
        ).match<Option<T>>({
          Ok: (value) => Some(value),
          Err: () => None,
        }) as Option<T>;
      },

      set(index: number, element: T): Result<T, string> {
        return tryCatch(
          () => next.set(index, element),
          (error) => String(error)
        );
      },

      removeAt(index: number): Result<T, string> {
        return tryCatch(
          () => next.removeAt(index),
          (error) => String(error)
        );
      },

      first(): Option<T> {
        return next.isEmpty ? None : Some(next.first());
      },

      last(): Option<T> {
        return next.isEmpty ? None : Some(next.last());
      },

      pop(): Option<T> {
        if (next.isEmpty) return None;
        return tryCatch(
          () => next.pop(),
          () => "List is empty"
        ).match<Option<T>>({
          Ok: (value) => Some(value),
          Err: () => None,
        }) as Option<T>;
      },

      shift(): Option<T> {
        if (next.isEmpty) return None;
        return tryCatch(
          () => next.shift(),
          () => "List is empty"
        ).match<Option<T>>({
          Ok: (value) => Some(value),
          Err: () => None,
        }) as Option<T>;
      },
    };

    // Extend next with safe property
    return Object.assign(next, { safe });
  };
}

/**
 * Creates a safe Queue middleware.
 */
export function safeQueue<T>(): Middleware<
  Queue<T> & { safe: SafeQueueOperations<T> }
> {
  return (next: Queue<T>): Queue<T> & { safe: SafeQueueOperations<T> } => {
    const safe: SafeQueueOperations<T> = {
      peek(): Option<T> {
        if (next.isEmpty) return None;
        return tryCatch(
          () => next.peek(),
          () => "Queue is empty"
        ).match<Option<T>>({
          Ok: (value) => Some(value),
          Err: () => None,
        }) as Option<T>;
      },

      poll(): Option<T> {
        if (next.isEmpty) return None;
        return tryCatch(
          () => next.poll(),
          () => "Queue is empty"
        ).match<Option<T>>({
          Ok: (value) => Some(value),
          Err: () => None,
        }) as Option<T>;
      },

      dequeue(): Option<T> {
        if (next.isEmpty) return None;
        return tryCatch(
          () => next.dequeue(),
          () => "Queue is empty"
        ).match<Option<T>>({
          Ok: (value) => Some(value),
          Err: () => None,
        }) as Option<T>;
      },
    };

    return Object.assign(next, { safe });
  };
}

/**
 * Creates a safe Deque middleware.
 */
export function safeDeque<T>(): Middleware<
  Deque<T> & { safe: SafeDequeOperations<T> }
> {
  return (next: Deque<T>): Deque<T> & { safe: SafeDequeOperations<T> } => {
    const safe: SafeDequeOperations<T> = {
      peek(): Option<T> {
        return next.isEmpty ? None : Some(next.peekFirst());
      },

      poll(): Option<T> {
        return next.pollFirst() !== undefined ? Some(next.pollFirst()!) : None;
      },

      dequeue(): Option<T> {
        if (next.isEmpty) return None;
        return tryCatch(
          () => next.dequeue(),
          () => "Deque is empty"
        ).match<Option<T>>({
          Ok: (value) => Some(value),
          Err: () => None,
        }) as Option<T>;
      },

      peekFirst(): Option<T> {
        return next.isEmpty ? None : Some(next.peekFirst());
      },

      peekLast(): Option<T> {
        return next.isEmpty ? None : Some(next.peekLast());
      },

      pollFirst(): Option<T> {
        const result = next.pollFirst();
        return result !== undefined ? Some(result) : None;
      },

      pollLast(): Option<T> {
        const result = next.pollLast();
        return result !== undefined ? Some(result) : None;
      },

      pop(): Option<T> {
        if (next.isEmpty) return None;
        return tryCatch(
          () => next.pop(),
          () => "Deque is empty"
        ).match<Option<T>>({
          Ok: (value) => Some(value),
          Err: () => None,
        }) as Option<T>;
      },
    };

    return Object.assign(next, { safe });
  };
}

/**
 * Creates a safe Map middleware.
 */
export function safeMap<K, V>(): Middleware<
  MapLike<K, V> & { safe: SafeMapOperations<K, V> }
> {
  return (
    next: MapLike<K, V>
  ): MapLike<K, V> & { safe: SafeMapOperations<K, V> } => {
    const safe: SafeMapOperations<K, V> = {
      get(key: K): Option<V> {
        return next.has(key) ? Some(next.get(key)) : None;
      },

      set(key: K, value: V): Result<V | undefined, string> {
        return tryCatch(
          () => next.set(key, value),
          (error) => String(error)
        );
      },

      delete(key: K): Result<V | undefined, string> {
        return tryCatch(
          () => next.delete(key),
          (error) => String(error)
        );
      },
    };

    return Object.assign(next, { safe });
  };
}

/**
 * Helper to match on Result type.
 * Note: The match method is already built into Ok and Err constructors
 * in effects.ts, so no runtime augmentation is needed.
 */
declare module "../core/effects.js" {
  interface Ok<T> {
    match<U>(cases: { Ok: (value: T) => U; Err: (error: never) => U }): U;
  }
  interface Err<E> {
    match<U>(cases: { Ok: (value: never) => U; Err: (error: E) => U }): U;
  }
}

/**
 * Generic safe middleware that works with any collection.
 */
export function safe<C extends object>(): Middleware<C> {
  // Return as-is for now; specialized versions handle specific types
  return (next: C): C => next;
}
