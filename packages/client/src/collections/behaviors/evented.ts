/**
 * Evented behavior - Emits typed events on collection mutations.
 *
 * Wraps collections to emit events whenever elements are added, removed,
 * or the collection is cleared. Enables reactive programming patterns.
 *
 * @example
 * const list = compose(
 *   eventedList()
 * )(arrayList<number>())
 *
 * list.on('add', ({ value, index }) => {
 *   console.log(`Added ${value} at index ${index}`)
 * })
 *
 * list.add(42) // Triggers 'add' event
 */

import type { Middleware } from "../core/middleware.js";
import type { List } from "../interfaces/list.js";
import type { Queue, Deque } from "../interfaces/queue.js";
import type { MapLike } from "../interfaces/map.js";
import type { Collection } from "../interfaces/collection.js";
import { Emitter, type Unsubscribe } from "../core/events.js";

// ============================================================================
// Event type definitions
// ============================================================================

/**
 * Events emitted by List collections.
 */
export interface ListEvents<T> {
  /** Element was added */
  add: { value: T; index?: number };
  /** Element was removed */
  remove: { value: T; index?: number };
  /** Element was replaced */
  set: { oldValue: T; newValue: T; index: number };
  /** Collection was cleared */
  clear: {};
  /** Collection was sorted */
  sort: {};
  /** Collection was reversed */
  reverse: {};
}

/**
 * Events emitted by Queue collections.
 */
export interface QueueEvents<T> {
  /** Element was added to queue */
  enqueue: { value: T };
  /** Element was removed from queue */
  dequeue: { value: T };
  /** Collection was cleared */
  clear: {};
}

/**
 * Events emitted by Deque collections.
 */
export interface DequeEvents<T> {
  /** Element was added to front */
  addFirst: { value: T };
  /** Element was added to back */
  addLast: { value: T };
  /** Element was removed from front */
  removeFirst: { value: T };
  /** Element was removed from back */
  removeLast: { value: T };
  /** Collection was cleared */
  clear: {};
}

/**
 * Events emitted by Map collections.
 */
export interface MapEvents<K, V> {
  /** Key-value pair was set */
  set: { key: K; value: V; oldValue?: V };
  /** Key was deleted */
  delete: { key: K; value: V };
  /** Collection was cleared */
  clear: {};
}

/**
 * Generic collection events.
 */
export interface CollectionEvents<T> {
  /** Element was added */
  add: { value: T };
  /** Element was removed */
  remove: { value: T };
  /** Collection was cleared */
  clear: {};
}

// ============================================================================
// Evented middleware implementations
// ============================================================================

/**
 * Creates an evented List middleware.
 *
 * Emits events for add, remove, set, clear, sort, and reverse operations.
 */
export function eventedList<T>(): Middleware<
  List<T>,
  List<T> & {
    on<E extends keyof ListEvents<T>>(
      event: E,
      listener: (payload: ListEvents<T>[E]) => void
    ): Unsubscribe;
  }
> {
  return (next: List<T>) => {
    const emitter = new Emitter<ListEvents<T>>();

    return new Proxy(next, {
      get(target, prop, receiver) {
        // Expose event subscription
        if (prop === "on") {
          return emitter.on.bind(emitter);
        }

        const value = Reflect.get(target, prop, receiver);

        if (typeof value === "function") {
          switch (prop) {
            case "add":
            case "push":
              return function (element: T): any {
                const result = (value as Function).call(target, element);
                emitter.emit("add", { value: element });
                return result;
              };

            case "unshift":
              return function (element: T): void {
                (value as Function).call(target, element);
                emitter.emit("add", { value: element, index: 0 });
              };

            case "insert":
              return function (index: number, element: T): void {
                (value as Function).call(target, index, element);
                emitter.emit("add", { value: element, index });
              };

            case "set":
              return function (index: number, element: T): T {
                const oldValue = (value as Function).call(target, index, element);
                emitter.emit("set", { oldValue, newValue: element, index });
                return oldValue;
              };

            case "remove":
              return function (element: T): boolean {
                const result = (value as Function).call(target, element);
                if (result) {
                  emitter.emit("remove", { value: element });
                }
                return result;
              };

            case "removeAt":
              return function (index: number): T {
                const removed = (value as Function).call(target, index);
                emitter.emit("remove", { value: removed, index });
                return removed;
              };

            case "pop":
              return function (): T {
                const removed = (value as Function).call(target);
                emitter.emit("remove", { value: removed });
                return removed;
              };

            case "shift":
              return function (): T {
                const removed = (value as Function).call(target);
                emitter.emit("remove", { value: removed, index: 0 });
                return removed;
              };

            case "clear":
              return function (): void {
                (value as Function).call(target);
                emitter.emit("clear", {});
              };

            case "sort":
              return function (...args: any[]): void {
                (value as Function).apply(target, args);
                emitter.emit("sort", {});
              };

            case "reverse":
              return function (): void {
                (value as Function).call(target);
                emitter.emit("reverse", {});
              };
          }
        }

        return value;
      },
    }) as any;
  };
}

/**
 * Creates an evented Queue middleware.
 */
export function eventedQueue<T>(): Middleware<
  Queue<T>,
  Queue<T> & {
    on<E extends keyof QueueEvents<T>>(
      event: E,
      listener: (payload: QueueEvents<T>[E]) => void
    ): Unsubscribe;
  }
> {
  return (next: Queue<T>) => {
    const emitter = new Emitter<QueueEvents<T>>();

    return new Proxy(next, {
      get(target, prop, receiver) {
        if (prop === "on") {
          return emitter.on.bind(emitter);
        }

        const value = Reflect.get(target, prop, receiver);

        if (typeof value === "function") {
          switch (prop) {
            case "offer":
            case "enqueue":
            case "add":
              return function (element: T): any {
                const result = (value as Function).call(target, element);
                if (result !== false) {
                  emitter.emit("enqueue", { value: element });
                }
                return result;
              };

            case "poll":
            case "dequeue":
              return function (): T {
                const removed = (value as Function).call(target);
                emitter.emit("dequeue", { value: removed });
                return removed;
              };

            case "clear":
              return function (): void {
                (value as Function).call(target);
                emitter.emit("clear", {});
              };
          }
        }

        return value;
      },
    }) as any;
  };
}

/**
 * Creates an evented Deque middleware.
 */
export function eventedDeque<T>(): Middleware<
  Deque<T>,
  Deque<T> & {
    on<E extends keyof DequeEvents<T>>(
      event: E,
      listener: (payload: DequeEvents<T>[E]) => void
    ): Unsubscribe;
  }
> {
  return (next: Deque<T>) => {
    const emitter = new Emitter<DequeEvents<T>>();

    return new Proxy(next, {
      get(target, prop, receiver) {
        if (prop === "on") {
          return emitter.on.bind(emitter);
        }

        const value = Reflect.get(target, prop, receiver);

        if (typeof value === "function") {
          switch (prop) {
            case "addFirst":
            case "offerFirst":
            case "push":
              return function (element: T): any {
                const result = (value as Function).call(target, element);
                emitter.emit("addFirst", { value: element });
                return result;
              };

            case "addLast":
            case "offerLast":
            case "offer":
            case "add":
              return function (element: T): any {
                const result = (value as Function).call(target, element);
                emitter.emit("addLast", { value: element });
                return result;
              };

            case "removeFirst":
            case "pollFirst":
            case "poll":
            case "dequeue":
              return function (): T {
                const removed = (value as Function).call(target);
                if (removed !== undefined) {
                  emitter.emit("removeFirst", { value: removed });
                }
                return removed;
              };

            case "removeLast":
            case "pollLast":
            case "pop":
              return function (): T {
                const removed = (value as Function).call(target);
                if (removed !== undefined) {
                  emitter.emit("removeLast", { value: removed });
                }
                return removed;
              };

            case "clear":
              return function (): void {
                (value as Function).call(target);
                emitter.emit("clear", {});
              };
          }
        }

        return value;
      },
    }) as any;
  };
}

/**
 * Creates an evented Map middleware.
 */
export function eventedMap<K, V>(): Middleware<
  MapLike<K, V>,
  MapLike<K, V> & {
    on<E extends keyof MapEvents<K, V>>(
      event: E,
      listener: (payload: MapEvents<K, V>[E]) => void
    ): Unsubscribe;
  }
> {
  return (next: MapLike<K, V>) => {
    const emitter = new Emitter<MapEvents<K, V>>();

    return new Proxy(next, {
      get(target, prop, receiver) {
        if (prop === "on") {
          return emitter.on.bind(emitter);
        }

        const value = Reflect.get(target, prop, receiver);

        if (typeof value === "function") {
          switch (prop) {
            case "set":
              return function (key: K, val: V): V | undefined {
                const oldValue = (value as Function).call(target, key, val);
                emitter.emit("set", { key, value: val, oldValue });
                return oldValue;
              };

            case "delete":
              return function (key: K): V | undefined {
                const deletedValue = (value as Function).call(target, key);
                if (deletedValue !== undefined) {
                  emitter.emit("delete", { key, value: deletedValue });
                }
                return deletedValue;
              };

            case "clear":
              return function (): void {
                (value as Function).call(target);
                emitter.emit("clear", {});
              };
          }
        }

        return value;
      },
    }) as any;
  };
}

/**
 * Generic evented collection middleware.
 */
export function evented<T>(): Middleware<
  Collection<T>,
  Collection<T> & {
    on<E extends keyof CollectionEvents<T>>(
      event: E,
      listener: (payload: CollectionEvents<T>[E]) => void
    ): Unsubscribe;
  }
> {
  return (next: Collection<T>) => {
    const emitter = new Emitter<CollectionEvents<T>>();

    return new Proxy(next, {
      get(target, prop, receiver) {
        if (prop === "on") {
          return emitter.on.bind(emitter);
        }

        const value = Reflect.get(target, prop, receiver);

        if (typeof value === "function") {
          switch (prop) {
            case "add":
              return function (element: T): boolean {
                const result = (value as Function).call(target, element);
                if (result) {
                  emitter.emit("add", { value: element });
                }
                return result;
              };

            case "remove":
              return function (element: T): boolean {
                const result = (value as Function).call(target, element);
                if (result) {
                  emitter.emit("remove", { value: element });
                }
                return result;
              };

            case "clear":
              return function (): void {
                (value as Function).call(target);
                emitter.emit("clear", {});
              };
          }
        }

        return value;
      },
    }) as any;
  };
}
