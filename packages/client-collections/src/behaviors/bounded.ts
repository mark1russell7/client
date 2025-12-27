/**
 * Bounded behavior - Enforces capacity limits on collections.
 *
 * Wraps collections to prevent them from exceeding a maximum size.
 * Provides various overflow policies to handle full collections.
 *
 * @example
 * const list = compose(
 *   boundedList({ capacity: 100, policy: 'drop-oldest' })
 * )(arrayList<number>())
 *
 * // Add 101 elements - first element will be dropped
 * for (let i = 0; i < 101; i++) {
 *   list.add(i)
 * }
 */

import type { Middleware } from "../core/middleware.js";
import type { List } from "../interfaces/list.js";
import type { Queue, Deque } from "../interfaces/queue.js";
import type { MapLike } from "../interfaces/map.js";
import type { Collection } from "../interfaces/collection.js";
import type {
  OverflowPolicy,
  OverflowHandler,
  OverflowContext,
} from "../core/policies.js";

/**
 * Options for bounded behavior.
 */
export interface BoundedOptions<T> {
  /**
   * Maximum number of elements the collection can hold.
   */
  capacity: number;

  /**
   * Policy for handling overflow when collection is full.
   * @default 'throw'
   */
  policy?: OverflowPolicy;

  /**
   * Optional callback invoked when overflow occurs.
   * Called before the policy is applied.
   */
  onOverflow?: OverflowHandler<T>;
}

/**
 * Marker interface for bounded collections.
 */
export interface BoundedCollection {
  readonly capacity: number;
  readonly isFull: boolean;
  readonly remainingCapacity: number;
}

/**
 * Creates a bounded List middleware.
 *
 * Intercepts add operations to enforce capacity limits.
 * Supports multiple overflow policies.
 */
export function boundedList<T>(
  options: BoundedOptions<T>
): Middleware<List<T>, List<T> & BoundedCollection> {
  const { capacity, policy = "throw", onOverflow } = options;

  return (next: List<T>): List<T> & BoundedCollection => {
    const handleOverflow = (element: T): void => {
      // Call overflow handler if provided
      if (onOverflow) {
        const context: OverflowContext<T> = {
          newElement: element,
          currentSize: next.size,
          capacity,
          timestamp: Date.now(),
        };
        onOverflow(context);
      }

      // Apply policy
      switch (policy) {
        case "throw":
          throw new Error(`List is full (capacity: ${capacity})`);

        case "drop-oldest":
          // Remove first element
          if (!next.isEmpty) {
            next.shift();
          }
          break;

        case "drop-newest":
          // Don't add the new element (do nothing)
          return;

        case "reject":
          // Silently reject (return false for add operations)
          return;

        case "grow":
          // Allow growth (do nothing, element will be added)
          return;

        case "block":
          throw new Error("Block policy not supported for sync collections");

        default:
          throw new Error(`Unknown overflow policy: ${policy}`);
      }
    };

    return new Proxy(next, {
      get(target, prop, receiver) {
        // Capacity property
        if (prop === "capacity") {
          return capacity;
        }

        // isFull property
        if (prop === "isFull") {
          return target.size >= capacity;
        }

        // remainingCapacity property
        if (prop === "remainingCapacity") {
          return Math.max(0, capacity - target.size);
        }

        const value = Reflect.get(target, prop, receiver);

        // Intercept methods that add elements
        if (typeof value === "function") {
          switch (prop) {
            case "add":
              return function (element: T): boolean {
                if (target.size >= capacity && policy !== "grow") {
                  handleOverflow(element);
                  if (policy === "reject" || policy === "drop-newest") {
                    return false;
                  }
                }
                return (value as Function).call(target, element);
              };

            case "push":
              return function (element: T): void {
                if (target.size >= capacity && policy !== "grow") {
                  handleOverflow(element);
                  if (policy === "reject" || policy === "drop-newest") {
                    return;
                  }
                }
                (value as Function).call(target, element);
              };

            case "unshift":
              return function (element: T): void {
                if (target.size >= capacity && policy !== "grow") {
                  handleOverflow(element);
                  if (policy === "reject" || policy === "drop-newest") {
                    return;
                  }
                  // For unshift with drop-oldest, we should drop from the end
                  if (policy === "drop-oldest" && !target.isEmpty) {
                    target.pop();
                  }
                }
                (value as Function).call(target, element);
              };

            case "insert":
              return function (index: number, element: T): void {
                if (target.size >= capacity && policy !== "grow") {
                  handleOverflow(element);
                  if (policy === "reject" || policy === "drop-newest") {
                    return;
                  }
                }
                (value as Function).call(target, index, element);
              };

            case "addAll":
            case "insertAll":
              return function (...args: any[]): boolean {
                const elements = args[args.length - 1] as Iterable<T>;
                const elementsArray = Array.from(elements);

                // Check if adding all elements would exceed capacity
                if (target.size + elementsArray.length > capacity && policy !== "grow") {
                  // Add elements one by one with overflow handling
                  let added = false;
                  for (const element of elementsArray) {
                    if (target.size >= capacity) {
                      handleOverflow(element);
                      if (policy === "reject" || policy === "drop-newest") {
                        break;
                      }
                    }
                    if (prop === "addAll") {
                      target.add(element);
                    } else {
                      target.insert(args[0] as number, element);
                    }
                    added = true;
                  }
                  return added;
                }

                return (value as Function).apply(target, args);
              };
          }
        }

        return value;
      },
    }) as List<T> & BoundedCollection;
  };
}

/**
 * Creates a bounded Queue middleware.
 */
export function boundedQueue<T>(
  options: BoundedOptions<T>
): Middleware<Queue<T>, Queue<T> & BoundedCollection> {
  const { capacity, policy = "throw", onOverflow } = options;

  return (next: Queue<T>): Queue<T> & BoundedCollection => {
    const handleOverflow = (element: T): void => {
      if (onOverflow) {
        const context: OverflowContext<T> = {
          newElement: element,
          currentSize: next.size,
          capacity,
          timestamp: Date.now(),
        };
        onOverflow(context);
      }

      switch (policy) {
        case "throw":
          throw new Error(`Queue is full (capacity: ${capacity})`);
        case "drop-oldest":
          if (!next.isEmpty) {
            next.poll();
          }
          break;
        case "drop-newest":
        case "reject":
          return;
        case "grow":
          return;
        case "block":
          throw new Error("Block policy not supported for sync collections");
        default:
          throw new Error(`Unknown overflow policy: ${policy}`);
      }
    };

    return new Proxy(next, {
      get(target, prop, receiver) {
        if (prop === "capacity") return capacity;
        if (prop === "isFull") return target.size >= capacity;
        if (prop === "remainingCapacity") return Math.max(0, capacity - target.size);

        const value = Reflect.get(target, prop, receiver);

        if (typeof value === "function") {
          switch (prop) {
            case "offer":
            case "enqueue":
            case "add":
              return function (element: T): boolean {
                if (target.size >= capacity && policy !== "grow") {
                  handleOverflow(element);
                  if (policy === "reject" || policy === "drop-newest") {
                    return false;
                  }
                }
                return (value as Function).call(target, element);
              };
          }
        }

        return value;
      },
    }) as Queue<T> & BoundedCollection;
  };
}

/**
 * Creates a bounded Deque middleware.
 */
export function boundedDeque<T>(
  options: BoundedOptions<T>
): Middleware<Deque<T>, Deque<T> & BoundedCollection> {
  const { capacity, policy = "throw", onOverflow } = options;

  return (next: Deque<T>): Deque<T> & BoundedCollection => {
    const handleOverflow = (element: T): void => {
      if (onOverflow) {
        const context: OverflowContext<T> = {
          newElement: element,
          currentSize: next.size,
          capacity,
          timestamp: Date.now(),
        };
        onOverflow(context);
      }

      switch (policy) {
        case "throw":
          throw new Error(`Deque is full (capacity: ${capacity})`);
        case "drop-oldest":
          if (!next.isEmpty) {
            next.removeFirst();
          }
          break;
        case "drop-newest":
        case "reject":
          return;
        case "grow":
          return;
        case "block":
          throw new Error("Block policy not supported for sync collections");
        default:
          throw new Error(`Unknown overflow policy: ${policy}`);
      }
    };

    return new Proxy(next, {
      get(target, prop, receiver) {
        if (prop === "capacity") return capacity;
        if (prop === "isFull") return target.size >= capacity;
        if (prop === "remainingCapacity") return Math.max(0, capacity - target.size);

        const value = Reflect.get(target, prop, receiver);

        if (typeof value === "function") {
          switch (prop) {
            case "addFirst":
            case "addLast":
            case "offerFirst":
            case "offerLast":
            case "push":
            case "offer":
            case "add":
              return function (element: T): any {
                if (target.size >= capacity && policy !== "grow") {
                  handleOverflow(element);
                  if (policy === "reject" || policy === "drop-newest") {
                    return prop.startsWith("offer") || prop === "add" ? false : undefined;
                  }
                }
                return (value as Function).call(target, element);
              };
          }
        }

        return value;
      },
    }) as Deque<T> & BoundedCollection;
  };
}

/**
 * Creates a bounded Map middleware.
 */
export function boundedMap<K, V>(
  options: Omit<BoundedOptions<V>, "onOverflow"> & {
    onOverflow?: (context: Omit<OverflowContext<V>, "newElement"> & { key: K; value: V }) => void;
  }
): Middleware<MapLike<K, V>, MapLike<K, V> & BoundedCollection> {
  const { capacity, policy = "throw", onOverflow } = options;

  return (next: MapLike<K, V>): MapLike<K, V> & BoundedCollection => {
    let insertionOrder: K[] = []; // Track insertion order for drop-oldest

    const handleOverflow = (key: K, value: V): void => {
      if (onOverflow) {
        onOverflow({
          key,
          value,
          currentSize: next.size,
          capacity,
          timestamp: Date.now(),
        });
      }

      switch (policy) {
        case "throw":
          throw new Error(`Map is full (capacity: ${capacity})`);
        case "drop-oldest":
          // Remove oldest key
          if (insertionOrder.length > 0) {
            const oldestKey = insertionOrder.shift()!;
            next.delete(oldestKey);
          }
          break;
        case "drop-newest":
        case "reject":
          return;
        case "grow":
          return;
        case "block":
          throw new Error("Block policy not supported for sync collections");
        default:
          throw new Error(`Unknown overflow policy: ${policy}`);
      }
    };

    return new Proxy(next, {
      get(target, prop, receiver) {
        if (prop === "capacity") return capacity;
        if (prop === "isFull") return target.size >= capacity;
        if (prop === "remainingCapacity") return Math.max(0, capacity - target.size);

        const value = Reflect.get(target, prop, receiver);

        if (typeof value === "function") {
          switch (prop) {
            case "set":
              return function (key: K, val: V): V | undefined {
                const hadKey = target.has(key);

                if (!hadKey && target.size >= capacity && policy !== "grow") {
                  handleOverflow(key, val);
                  if (policy === "reject" || policy === "drop-newest") {
                    return undefined;
                  }
                }

                const result = (value as Function).call(target, key, val);

                // Track insertion order
                if (!hadKey) {
                  insertionOrder.push(key);
                }

                return result;
              };

            case "delete":
              return function (key: K): V | undefined {
                const result = (value as Function).call(target, key);
                // Remove from insertion order tracking
                insertionOrder = insertionOrder.filter((k) => !target.keyEq(k, key));
                return result;
              };

            case "clear":
              return function (): void {
                (value as Function).call(target);
                insertionOrder = [];
              };
          }
        }

        return value;
      },
    }) as MapLike<K, V> & BoundedCollection;
  };
}

/**
 * Generic bounded collection middleware.
 * Works with any collection type.
 */
export function bounded<C extends Collection<any>>(
  options: BoundedOptions<any>
): Middleware<C, C & BoundedCollection> {
  return boundedList(options) as any;
}
