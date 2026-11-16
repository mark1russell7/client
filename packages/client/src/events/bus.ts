/**
 * Event Bus Implementation
 *
 * Central pub/sub system for streaming coordination.
 */

import type {
  EventBus,
  TypedEventBus,
  ChannelMap,
  EventHandler,
  Unsubscribe,
  EventBusOptions,
  EventFanOutOptions,
  EventListenOptions,
  EventWaitOptions,
} from "./types.js";
import { realClock, type Clock } from "../clock.js";
import { toMs, type Duration } from "../duration.js";

/** The error of a wait that its signal ended. */
function abortedError(channel: string): Error {
  const error = new Error(`The wait on channel "${channel}" was aborted`);
  error.name = "AbortError";
  return error;
}

/**
 * The error of a wait that `clear()` ended. Its name is `AbortError`, so code that ignores a
 * cancelled wait ignores this one too.
 */
function clearedError(channel: string): Error {
  const error = new Error(`The wait on channel "${channel}" ended, because clear() removed the channel`);
  error.name = "AbortError";
  return error;
}

/** The default of `fanOut.maxPending`. No bench chose it: a run of a slow channel can change it. */
const DEFAULT_MAX_PENDING = 1024;

/** The default of `fanOut.schedule`: a later task of the event loop. */
function nextTask(slice: () => void): void {
  if (typeof setImmediate === "function") setImmediate(slice);
  else setTimeout(slice, 0);
}

/** The emit whose handler runs, or undefined. A handler that emits gets the mark of its own emit. */
let emitting: object | undefined;

/**
 * This function gives the mark of the emit whose handler runs: one object for each `emit()` of a
 * `DefaultEventBus`. Each handler of that emit gets the same object. It gives undefined outside a handler, in
 * the replay of the buffer, and for another bus. The publisher ties the shared text of a value to
 * one emit with it (audit 2026-11-08).
 */
export function currentEmission(): object | undefined {
  return emitting;
}

/** The handlers of a channel, each with the number of its subscription, in the order of these numbers. */
type ChannelHandlers = Map<EventHandler<unknown>, number>;

/** One event that waits for its slices. */
interface PendingEvent {
  readonly channel: string;
  readonly data: unknown;
  /** The handlers of the channel at `emit()`. A new map of the channel gets no old event. */
  readonly handlers: ChannelHandlers;
  /** The live cursor: a removed handler gets no call, with no copy of the handlers per event. */
  readonly cursor: Iterator<[EventHandler<unknown>, number]>;
  /** The last subscription at `emit()`. A later handler does not get this event. */
  readonly lastSubscription: number;
  /** The mark of the emit (`currentEmission()`): a small object, so a share keeps no handlers. */
  readonly emission: object;
  done: boolean;
}

// =============================================================================
// Event Bus Implementation
// =============================================================================

/**
 * Default event bus implementation.
 * Supports pub/sub messaging with async iteration.
 */
export class DefaultEventBus implements EventBus {
  private readonly subscribers = new Map<string, ChannelHandlers>();
  /** The number of the last subscription of this bus. */
  private lastSubscription = 0;
  /** The events that wait for their slices, oldest first, from the index `pendingHead`. */
  private pending: PendingEvent[] = [];
  private pendingHead = 0;
  /** For each channel, the number of its events in `pending`. */
  private readonly pendingOn = new Map<string, number>();
  private sliceScheduled = false;
  private drainWaiters: Array<() => void> = [];
  private readonly buffer = new Map<string, unknown[]>();
  /**
   * For each channel, the functions that `clear()` runs: the `onClear` of each handler of `on()`
   * that has one. Each open stream has one too, so `clear()` ends it.
   */
  private readonly clearHandlers = new Map<string, Set<() => void>>();
  private readonly options: Required<Omit<EventBusOptions, "fanOut">>;
  private readonly fanOut: Required<EventFanOutOptions> | undefined;

  constructor(options: EventBusOptions = {}) {
    const { fanOut } = options;
    if (fanOut && (!Number.isInteger(fanOut.sliceSize) || fanOut.sliceSize < 1)) {
      throw new RangeError(`The option fanOut.sliceSize must be a whole number from 1 up, not ${fanOut.sliceSize}`);
    }
    if (fanOut?.maxPending !== undefined && (!Number.isInteger(fanOut.maxPending) || fanOut.maxPending < 1)) {
      throw new RangeError(`The option fanOut.maxPending must be a whole number from 1 up, not ${fanOut.maxPending}`);
    }
    this.fanOut = fanOut && { maxPending: DEFAULT_MAX_PENDING, schedule: nextTask, ...fanOut };
    this.options = {
      bufferSize: options.bufferSize ?? 0,
      onError: options.onError ?? ((error, channel) => {
        console.error(`EventBus error on channel "${channel}":`, error);
      }),
      debug: options.debug ?? false,
    };
  }

  /**
   * Emit an event on a channel.
   *
   * Without the option `fanOut`, each handler runs before this method returns. With it, a channel
   * with more than `fanOut.sliceSize` handlers delivers later, in slices (roadmap CLI-90). One
   * handler gets the events of a channel in the order of `emit()`. An unsubscribe stops the calls
   * that wait for that handler. A handler that comes after `emit()` does not get the event. The
   * events of two different channels can reach a handler in another order.
   */
  emit<T>(channel: string, data: T): void {
    if (this.options.debug) {
      console.log(`[EventBus] emit "${channel}":`, data);
    }

    // Buffer event if configured
    if (this.options.bufferSize > 0) {
      const channelBuffer = this.buffer.get(channel) ?? [];
      channelBuffer.push(data);

      // Trim buffer to max size
      while (channelBuffer.length > this.options.bufferSize) {
        channelBuffer.shift();
      }

      this.buffer.set(channel, channelBuffer);
    }

    // Notify subscribers
    const channelSubs = this.subscribers.get(channel);
    if (!channelSubs) return;

    if (this.fanOut && (channelSubs.size > this.fanOut.sliceSize || this.pendingOn.has(channel))) {
      this.enqueue(channel, data, channelSubs, this.fanOut);
      return;
    }

    const emission = {};
    for (const handler of channelSubs.keys()) this.call(handler, data, channel, emission);
  }

  /** This function calls one handler. An error goes to `onError`, and it stops no other handler. */
  private call(handler: EventHandler<unknown>, data: unknown, channel: string, emission?: object): void {
    const outer = emitting;
    emitting = emission;
    try {
      const result = handler(data);
      // Handle async handlers
      if (result instanceof Promise) {
        result.catch((error) => this.options.onError(error, channel));
      }
    } catch (error) {
      this.options.onError(error instanceof Error ? error : new Error(String(error)), channel);
    } finally {
      emitting = outer;
    }
  }

  /** This function puts an event in the queue of the slices. A full queue finishes its oldest events. */
  private enqueue(channel: string, data: unknown, handlers: ChannelHandlers, fanOut: Required<EventFanOutOptions>): void {
    this.pending.push({ channel, data, handlers, cursor: handlers.entries(), lastSubscription: this.lastSubscription, emission: {}, done: false });
    this.pendingOn.set(channel, (this.pendingOn.get(channel) ?? 0) + 1);
    while (this.pending.length - this.pendingHead > fanOut.maxPending) {
      const oldest = this.pending[this.pendingHead]!;
      this.deliverPart(oldest, Number.POSITIVE_INFINITY);
      this.retire(oldest);
    }
    this.scheduleSlice(fanOut);
  }

  private scheduleSlice(fanOut: Required<EventFanOutOptions>): void {
    if (this.sliceScheduled || this.pendingHead === this.pending.length) return;
    this.sliceScheduled = true;
    fanOut.schedule(() => {
      this.sliceScheduled = false;
      this.deliver(fanOut.sliceSize);
      this.scheduleSlice(fanOut);
    });
  }

  /** This function calls at most `limit` handlers of the oldest events. */
  private deliver(limit: number): void {
    let left = limit;
    while (left > 0 && this.pendingHead < this.pending.length) {
      const event = this.pending[this.pendingHead]!;
      left -= this.deliverPart(event, left);
      if (event.done) this.retire(event);
    }
    if (this.pendingHead === this.pending.length) this.drainWaiters.splice(0).forEach((resolve) => resolve());
  }

  /** This function calls at most `limit` handlers of one event, and returns the count of calls. */
  private deliverPart(event: PendingEvent, limit: number): number {
    let calls = 0;
    while (calls < limit && !event.done) {
      // clear(), or the last unsubscribe: the map of this event is not the map of the channel now
      const step = this.subscribers.get(event.channel) === event.handlers ? event.cursor.next() : undefined;
      if (!step || step.done || step.value[1] > event.lastSubscription) {
        event.done = true;
        break;
      }
      // Each slice of one emit gives the same mark
      this.call(step.value[0], event.data, event.channel, event.emission);
      calls++;
    }
    return calls;
  }

  /**
   * This function takes a finished event from the queue. A handler in a slice can emit, and that
   * emit can finish the event first, so this function examines the head.
   */
  private retire(event: PendingEvent): void {
    if (this.pending[this.pendingHead] !== event) return;
    this.pendingHead++;
    const left = (this.pendingOn.get(event.channel) ?? 1) - 1;
    if (left === 0) this.pendingOn.delete(event.channel);
    else this.pendingOn.set(event.channel, left);
    if (this.pendingHead === this.pending.length) {
      this.pending = [];
      this.pendingHead = 0;
    } else if (this.pendingHead > 1024 && this.pendingHead * 2 > this.pending.length) {
      this.pending = this.pending.slice(this.pendingHead);
      this.pendingHead = 0;
    }
  }

  /**
   * This method resolves when no event waits for a slice. A host calls it before it stops. Without
   * the option `fanOut`, it resolves at once.
   */
  drained(): Promise<void> {
    if (this.pendingHead === this.pending.length) return Promise.resolve();
    return new Promise((resolve) => this.drainWaiters.push(resolve));
  }

  /**
   * Subscribe to events on a channel. The `onClear` of the options runs one time when `clear()`
   * or `clearAll()` removes the handler, not at an unsubscribe.
   */
  on<T>(channel: string, handler: EventHandler<T>, options: EventListenOptions = {}): Unsubscribe {
    if (this.options.debug) {
      console.log(`[EventBus] subscribe "${channel}"`);
    }

    let channelSubs = this.subscribers.get(channel);
    if (!channelSubs) {
      channelSubs = new Map();
      this.subscribers.set(channel, channelSubs);
    }

    // A handler that is already on the channel keeps its place and its number
    if (!channelSubs.has(handler as EventHandler<unknown>)) {
      channelSubs.set(handler as EventHandler<unknown>, ++this.lastSubscription);
    }

    // The unsubscribe function works once, and removes only the set it added to. (Before, a
    // repeated call of an old unsubscribe removed the set of a newer subscriber: deep dive CORE-15.)
    // A clear() also ends the handler: then its unsubscribe does nothing.
    let subscribed = true;
    const { onClear } = options;
    let cleared: (() => void) | undefined;
    if (onClear) {
      cleared = () => {
        if (!subscribed) return;
        subscribed = false;
        try {
          onClear();
        } catch (error) {
          this.options.onError(error instanceof Error ? error : new Error(String(error)), channel);
        }
      };
      let handlers = this.clearHandlers.get(channel);
      if (!handlers) {
        handlers = new Set();
        this.clearHandlers.set(channel, handlers);
      }
      handlers.add(cleared);
    }

    // Replay buffered events if any
    const buffered = this.buffer.get(channel);
    if (buffered && buffered.length > 0) {
      for (const data of buffered) this.call(handler as EventHandler<unknown>, data, channel);
    }

    return () => {
      if (!subscribed) return;
      subscribed = false;
      if (this.options.debug) {
        console.log(`[EventBus] unsubscribe "${channel}"`);
      }
      channelSubs.delete(handler as EventHandler<unknown>);

      // Clean up empty channel sets
      if (channelSubs.size === 0 && this.subscribers.get(channel) === channelSubs) {
        this.subscribers.delete(channel);
      }
      if (cleared) {
        const handlers = this.clearHandlers.get(channel);
        if (handlers?.delete(cleared) && handlers.size === 0) this.clearHandlers.delete(channel);
      }
    };
  }

  /** This function runs the clear handlers of the channels, after it removed them from the bus. */
  private runClearHandlers(channels: readonly string[]): void {
    const handlers: Array<() => void> = [];
    for (const channel of channels) {
      handlers.push(...(this.clearHandlers.get(channel) ?? []));
      this.clearHandlers.delete(channel);
    }
    for (const cleared of handlers) cleared();
  }

  /**
   * Subscribe to a single event on a channel. On a buffered channel, the first buffered event
   * resolves the promise. When the signal aborts first, the promise rejects with an `AbortError`.
   */
  once<T>(channel: string, options: EventWaitOptions = {}): Promise<T> {
    const { signal } = options;
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortedError(channel));
        return;
      }
      let settled = false;
      let unsubscribe: Unsubscribe | undefined;
      const onAbort = (): void => {
        if (settled) return;
        settled = true;
        unsubscribe?.();
        reject(abortedError(channel));
      };
      // on() can replay a buffered event before it returns: the handler must not need
      // `unsubscribe` yet (before, it threw a ReferenceError, and the promise never settled).
      // clear() rejects the wait: before, the promise never settled.
      unsubscribe = this.on<T>(
        channel,
        (data) => {
          if (settled) return;
          settled = true;
          unsubscribe?.();
          signal?.removeEventListener("abort", onAbort);
          resolve(data);
        },
        {
          onClear: () => {
            if (settled) return;
            settled = true;
            signal?.removeEventListener("abort", onAbort);
            reject(clearedError(channel));
          },
        },
      );
      if (settled) {
        unsubscribe();
        return;
      }
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  /**
   * Create an async iterable for a channel. The stream ends when the reader stops, when the
   * signal of the options aborts, or when `clear()` removes the channel.
   */
  stream<T>(channel: string, options: EventWaitOptions = {}): AsyncIterable<T> {
    const self = this;
    const { signal } = options;

    return {
      [Symbol.asyncIterator](): AsyncIterator<T> {
        const queue: T[] = [];
        let resolve: ((value: IteratorResult<T>) => void) | null = null;
        let done = signal?.aborted ?? false;
        let unsubscribe: Unsubscribe = () => {};

        // End the stream: no more events, and a waiting reader gets `done`
        const end = (): void => {
          if (done) return;
          done = true;
          unsubscribe();
          signal?.removeEventListener("abort", end);
          const r = resolve;
          resolve = null;
          r?.({ value: undefined, done: true });
        };

        // Subscribe to channel. A clear() of the channel ends the stream.
        if (!done) {
          unsubscribe = self.on<T>(
            channel,
            (data) => {
              if (done) return;

              if (resolve) {
                // Someone is waiting, resolve immediately
                const r = resolve;
                resolve = null;
                r({ value: data, done: false });
              } else {
                // Queue for later
                queue.push(data);
              }
            },
            { onClear: end },
          );
          signal?.addEventListener("abort", end, { once: true });
        }

        return {
          async next(): Promise<IteratorResult<T>> {
            // If we have queued items, return one
            if (queue.length > 0) {
              return { value: queue.shift()!, done: false };
            }

            if (done) {
              return { value: undefined, done: true };
            }

            // Wait for next event
            return new Promise((r) => {
              resolve = r;
            });
          },

          async return(): Promise<IteratorResult<T>> {
            queue.length = 0;
            end();
            return { value: undefined, done: true };
          },

          async throw(error?: Error): Promise<IteratorResult<T>> {
            queue.length = 0;
            end();
            throw error;
          },
        };
      },
    };
  }

  /**
   * Get the number of subscribers on a channel.
   */
  subscriberCount(channel: string): number {
    return this.subscribers.get(channel)?.size ?? 0;
  }

  /**
   * Check if a channel has any subscribers.
   */
  hasSubscribers(channel: string): boolean {
    return this.subscriberCount(channel) > 0;
  }

  /**
   * Get all active channel names.
   */
  channels(): string[] {
    return Array.from(this.subscribers.keys());
  }

  /**
   * Remove all subscribers from a channel. The `onClear` of each removed handler runs, and each
   * stream of the channel ends.
   */
  clear(channel: string): void {
    if (this.options.debug) {
      console.log(`[EventBus] clear "${channel}"`);
    }
    this.subscribers.delete(channel);
    this.buffer.delete(channel);
    // The streams of the channel end: before, their readers waited forever (deep dive CORE-15).
    // The remote subscriptions end with notice too (EVENTS.md).
    this.runClearHandlers([channel]);
  }

  /**
   * Remove all subscribers from all channels. The `onClear` of each removed handler runs, and
   * each stream ends.
   */
  clearAll(): void {
    if (this.options.debug) {
      console.log("[EventBus] clearAll");
    }
    this.subscribers.clear();
    this.buffer.clear();
    this.runClearHandlers([...this.clearHandlers.keys()]);
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a new event bus instance.
 *
 * @param options - Event bus options
 * @returns EventBus instance
 *
 * @example
 * ```typescript
 * const bus = createEventBus();
 *
 * bus.on("updates", (data) => console.log(data));
 * bus.emit("updates", { message: "Hello" });
 * ```
 */
export function createEventBus(options?: EventBusOptions): EventBus {
  return new DefaultEventBus(options);
}

/**
 * Create a typed event bus with predefined channels.
 *
 * @param options - Event bus options
 * @returns TypedEventBus instance
 *
 * @example
 * ```typescript
 * interface MyChannels {
 *   "user:created": { id: string; name: string };
 *   "user:updated": User;
 * }
 *
 * const bus = createTypedEventBus<MyChannels>();
 *
 * // Type-safe
 * bus.emit("user:created", { id: "1", name: "John" });
 * bus.on("user:created", (user) => console.log(user.name));
 * ```
 */
export function createTypedEventBus<TChannels extends ChannelMap>(
  options?: EventBusOptions
): TypedEventBus<TChannels> {
  return new DefaultEventBus(options) as TypedEventBus<TChannels>;
}

// =============================================================================
// Global Event Bus
// =============================================================================

/**
 * Global event bus singleton.
 * Use for application-wide event coordination.
 */
let globalBus: EventBus | undefined;

/**
 * Get or create the global event bus.
 *
 * @param options - Options for creating the bus (only used on first call)
 * @returns Global EventBus instance
 */
export function getGlobalEventBus(options?: EventBusOptions): EventBus {
  if (!globalBus) {
    globalBus = createEventBus(options);
  }
  return globalBus;
}

/**
 * Reset the global event bus.
 * Useful for testing.
 */
export function resetGlobalEventBus(): void {
  globalBus?.clearAll();
  globalBus = undefined;
}

/** The key of the bus under a view of a bus. */
const BASE_BUS = Symbol.for("procedures.baseBus");

/**
 * A view of a bus whose `stream()` and `once()` use a signal when the caller gives none. The
 * context of a procedure gets this view: when the invocation aborts, the handler's waits on
 * the bus end, and the handler can finish (deep dive CORE-15).
 *
 * @param bus - The event bus
 * @param signal - The signal of the invocation
 * @returns An EventBus that shares the subscribers of `bus`
 */
export function withEventBusSignal(bus: EventBus, signal: AbortSignal): EventBus {
  const waitOptions = (options?: EventWaitOptions): EventWaitOptions => ({ signal: options?.signal ?? signal });
  const view: EventBus = {
    emit: (channel, data) => bus.emit(channel, data),
    on: (channel, handler, options) => bus.on(channel, handler, options),
    once: (channel, options) => bus.once(channel, waitOptions(options)),
    stream: (channel, options) => bus.stream(channel, waitOptions(options)),
    subscriberCount: (channel) => bus.subscriberCount(channel),
    hasSubscribers: (channel) => bus.hasSubscribers(channel),
    channels: () => bus.channels(),
    clear: (channel) => bus.clear(channel),
    clearAll: () => bus.clearAll(),
  };
  // The bus under the view: the marks of the row filters of the events belong to it (roadmap CLI-78)
  return Object.defineProperty(view, BASE_BUS, { value: (bus as { [BASE_BUS]?: EventBus })[BASE_BUS] ?? bus, enumerable: false });
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Create a channel prefix helper for namespaced events.
 *
 * @param prefix - Prefix for all channels
 * @returns Object with prefixed emit/on/stream methods
 *
 * @example
 * ```typescript
 * const userEvents = createChannelPrefix(bus, "user");
 *
 * userEvents.emit("created", { id: "1" }); // Emits "user:created"
 * userEvents.on("updated", handler);       // Subscribes to "user:updated"
 * ```
 */
export function createChannelPrefix(bus: EventBus, prefix: string) {
  const prefixed = (channel: string) => `${prefix}:${channel}`;

  return {
    emit<T>(channel: string, data: T): void {
      bus.emit(prefixed(channel), data);
    },

    on<T>(channel: string, handler: EventHandler<T>, options?: EventListenOptions): Unsubscribe {
      return bus.on(prefixed(channel), handler, options);
    },

    once<T>(channel: string, options?: EventWaitOptions): Promise<T> {
      return bus.once(prefixed(channel), options);
    },

    stream<T>(channel: string, options?: EventWaitOptions): AsyncIterable<T> {
      return bus.stream(prefixed(channel), options);
    },
  };
}

/**
 * Forward events from one channel to another.
 *
 * @param bus - Event bus
 * @param from - Source channel
 * @param to - Destination channel
 * @returns Unsubscribe function
 */
export function forwardChannel(bus: EventBus, from: string, to: string): Unsubscribe {
  return bus.on(from, (data) => bus.emit(to, data));
}

/**
 * Merge multiple channels into one.
 *
 * @param bus - Event bus
 * @param sources - Source channels
 * @param target - Target channel
 * @returns Unsubscribe function for all sources
 */
export function mergeChannels(
  bus: EventBus,
  sources: string[],
  target: string
): Unsubscribe {
  const unsubscribes = sources.map((source) => forwardChannel(bus, source, target));

  return () => {
    for (const unsub of unsubscribes) {
      unsub();
    }
  };
}

/**
 * Filter events on a channel.
 *
 * @param bus - Event bus
 * @param source - Source channel
 * @param target - Target channel
 * @param predicate - Filter function
 * @returns Unsubscribe function
 */
export function filterChannel<T>(
  bus: EventBus,
  source: string,
  target: string,
  predicate: (data: T) => boolean
): Unsubscribe {
  return bus.on<T>(source, (data) => {
    if (predicate(data)) {
      bus.emit(target, data);
    }
  });
}

/**
 * Transform events from one channel to another.
 *
 * @param bus - Event bus
 * @param source - Source channel
 * @param target - Target channel
 * @param transform - Transform function
 * @returns Unsubscribe function
 */
export function mapChannel<TIn, TOut>(
  bus: EventBus,
  source: string,
  target: string,
  transform: (data: TIn) => TOut
): Unsubscribe {
  return bus.on<TIn>(source, (data) => {
    bus.emit(target, transform(data));
  });
}

/** Options of `debounceChannel()` and `throttleChannel()`. */
export interface ChannelTimingOptions {
  /** The clock of the timers. The default is the clock of the platform. A test gives a fake clock. */
  clock?: Clock;
}

/**
 * This function sends the last event of `source` to `target` after `delay` without a new event
 * (a debounce). The delay is a `Duration`, such as `ms(300)`. A plain number throws a `TypeError`.
 *
 * @param bus - Event bus
 * @param source - Source channel
 * @param target - Target channel
 * @param delay - The time without an event before the send
 * @returns Unsubscribe function
 */
export function debounceChannel<T>(
  bus: EventBus,
  source: string,
  target: string,
  delay: Duration,
  options: ChannelTimingOptions = {},
): Unsubscribe {
  const delayMs = toMs(delay, "debounceChannel delay");
  const clock = options.clock ?? realClock;
  let cancel: (() => void) | null = null;
  let lastData: T | undefined;

  const unsub = bus.on<T>(source, (data) => {
    lastData = data;
    cancel?.();
    cancel = clock.after(delayMs, () => {
      cancel = null;
      if (lastData !== undefined) {
        bus.emit(target, lastData);
      }
    });
  });

  return () => {
    unsub();
    cancel?.();
    cancel = null;
  };
}

/**
 * This function sends an event of `source` to `target` at most one time in each `interval` (a
 * throttle). It drops the events between. The interval is a `Duration`, such as `seconds(1)`. A
 * plain number throws a `TypeError`.
 *
 * @param bus - Event bus
 * @param source - Source channel
 * @param target - Target channel
 * @param interval - The shortest time between two sends
 * @returns Unsubscribe function
 */
export function throttleChannel<T>(
  bus: EventBus,
  source: string,
  target: string,
  interval: Duration,
  options: ChannelTimingOptions = {},
): Unsubscribe {
  const intervalMs = toMs(interval, "throttleChannel interval");
  const clock = options.clock ?? realClock;
  let lastEmit: number | undefined;

  return bus.on<T>(source, (data) => {
    const now = clock.now();
    if (lastEmit === undefined || now - lastEmit >= intervalMs) {
      lastEmit = now;
      bus.emit(target, data);
    }
  });
}
