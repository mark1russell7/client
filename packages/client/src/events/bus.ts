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
  EventListenOptions,
  EventWaitOptions,
} from "./types.js";

/** The error of a wait that its signal ended. */
function abortedError(channel: string): Error {
  const error = new Error(`The wait on channel "${channel}" was aborted`);
  error.name = "AbortError";
  return error;
}

// =============================================================================
// Event Bus Implementation
// =============================================================================

/**
 * Default event bus implementation.
 * Supports pub/sub messaging with async iteration.
 */
export class DefaultEventBus implements EventBus {
  private readonly subscribers = new Map<string, Set<EventHandler<unknown>>>();
  private readonly buffer = new Map<string, unknown[]>();
  /**
   * For each channel, the functions that `clear()` runs: the `onClear` of each handler of `on()`
   * that has one. Each open stream has one too, so `clear()` ends it.
   */
  private readonly clearHandlers = new Map<string, Set<() => void>>();
  private readonly options: Required<EventBusOptions>;

  constructor(options: EventBusOptions = {}) {
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

    for (const handler of channelSubs) {
      try {
        const result = handler(data);
        // Handle async handlers
        if (result instanceof Promise) {
          result.catch((error) => this.options.onError(error, channel));
        }
      } catch (error) {
        this.options.onError(error instanceof Error ? error : new Error(String(error)), channel);
      }
    }
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
      channelSubs = new Set();
      this.subscribers.set(channel, channelSubs);
    }

    channelSubs.add(handler as EventHandler<unknown>);

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
      for (const data of buffered) {
        try {
          const result = handler(data as T);
          if (result instanceof Promise) {
            result.catch((error) => this.options.onError(error, channel));
          }
        } catch (error) {
          this.options.onError(error instanceof Error ? error : new Error(String(error)), channel);
        }
      }
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
      // `unsubscribe` yet (before, it threw a ReferenceError, and the promise never settled)
      unsubscribe = this.on<T>(channel, (data) => {
        if (settled) return;
        settled = true;
        unsubscribe?.();
        signal?.removeEventListener("abort", onAbort);
        resolve(data);
      });
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
  return {
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

/**
 * Debounce events on a channel.
 *
 * @param bus - Event bus
 * @param source - Source channel
 * @param target - Target channel
 * @param delay - Debounce delay in milliseconds
 * @returns Unsubscribe function
 */
export function debounceChannel<T>(
  bus: EventBus,
  source: string,
  target: string,
  delay: number
): Unsubscribe {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastData: T | undefined;

  const unsub = bus.on<T>(source, (data) => {
    lastData = data;

    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      if (lastData !== undefined) {
        bus.emit(target, lastData);
      }
      timer = null;
    }, delay);
  });

  return () => {
    unsub();
    if (timer) {
      clearTimeout(timer);
    }
  };
}

/**
 * Throttle events on a channel.
 *
 * @param bus - Event bus
 * @param source - Source channel
 * @param target - Target channel
 * @param interval - Throttle interval in milliseconds
 * @returns Unsubscribe function
 */
export function throttleChannel<T>(
  bus: EventBus,
  source: string,
  target: string,
  interval: number
): Unsubscribe {
  let lastEmit = 0;

  return bus.on<T>(source, (data) => {
    const now = Date.now();

    if (now - lastEmit >= interval) {
      lastEmit = now;
      bus.emit(target, data);
    }
  });
}
