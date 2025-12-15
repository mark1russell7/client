/**
 * Event Bus Implementation
 *
 * Central pub/sub system for streaming coordination.
 */
// =============================================================================
// Event Bus Implementation
// =============================================================================
/**
 * Default event bus implementation.
 * Supports pub/sub messaging with async iteration.
 */
export class DefaultEventBus {
    subscribers = new Map();
    buffer = new Map();
    options;
    constructor(options = {}) {
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
    emit(channel, data) {
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
        if (!channelSubs)
            return;
        for (const handler of channelSubs) {
            try {
                const result = handler(data);
                // Handle async handlers
                if (result instanceof Promise) {
                    result.catch((error) => this.options.onError(error, channel));
                }
            }
            catch (error) {
                this.options.onError(error instanceof Error ? error : new Error(String(error)), channel);
            }
        }
    }
    /**
     * Subscribe to events on a channel.
     */
    on(channel, handler) {
        if (this.options.debug) {
            console.log(`[EventBus] subscribe "${channel}"`);
        }
        let channelSubs = this.subscribers.get(channel);
        if (!channelSubs) {
            channelSubs = new Set();
            this.subscribers.set(channel, channelSubs);
        }
        channelSubs.add(handler);
        // Replay buffered events if any
        const buffered = this.buffer.get(channel);
        if (buffered && buffered.length > 0) {
            for (const data of buffered) {
                try {
                    const result = handler(data);
                    if (result instanceof Promise) {
                        result.catch((error) => this.options.onError(error, channel));
                    }
                }
                catch (error) {
                    this.options.onError(error instanceof Error ? error : new Error(String(error)), channel);
                }
            }
        }
        // Return unsubscribe function
        return () => {
            if (this.options.debug) {
                console.log(`[EventBus] unsubscribe "${channel}"`);
            }
            channelSubs?.delete(handler);
            // Clean up empty channel sets
            if (channelSubs && channelSubs.size === 0) {
                this.subscribers.delete(channel);
            }
        };
    }
    /**
     * Subscribe to a single event on a channel.
     */
    once(channel) {
        return new Promise((resolve) => {
            const unsubscribe = this.on(channel, (data) => {
                unsubscribe();
                resolve(data);
            });
        });
    }
    /**
     * Create an async iterable for a channel.
     */
    stream(channel) {
        const self = this;
        return {
            [Symbol.asyncIterator]() {
                const queue = [];
                let resolve = null;
                let done = false;
                // Subscribe to channel
                const unsubscribe = self.on(channel, (data) => {
                    if (done)
                        return;
                    if (resolve) {
                        // Someone is waiting, resolve immediately
                        const r = resolve;
                        resolve = null;
                        r({ value: data, done: false });
                    }
                    else {
                        // Queue for later
                        queue.push(data);
                    }
                });
                return {
                    async next() {
                        if (done) {
                            return { value: undefined, done: true };
                        }
                        // If we have queued items, return one
                        if (queue.length > 0) {
                            return { value: queue.shift(), done: false };
                        }
                        // Wait for next event
                        return new Promise((r) => {
                            resolve = r;
                        });
                    },
                    async return() {
                        done = true;
                        unsubscribe();
                        resolve?.({ value: undefined, done: true });
                        return { value: undefined, done: true };
                    },
                    async throw(error) {
                        done = true;
                        unsubscribe();
                        resolve?.({ value: undefined, done: true });
                        throw error;
                    },
                };
            },
        };
    }
    /**
     * Get the number of subscribers on a channel.
     */
    subscriberCount(channel) {
        return this.subscribers.get(channel)?.size ?? 0;
    }
    /**
     * Check if a channel has any subscribers.
     */
    hasSubscribers(channel) {
        return this.subscriberCount(channel) > 0;
    }
    /**
     * Get all active channel names.
     */
    channels() {
        return Array.from(this.subscribers.keys());
    }
    /**
     * Remove all subscribers from a channel.
     */
    clear(channel) {
        if (this.options.debug) {
            console.log(`[EventBus] clear "${channel}"`);
        }
        this.subscribers.delete(channel);
        this.buffer.delete(channel);
    }
    /**
     * Remove all subscribers from all channels.
     */
    clearAll() {
        if (this.options.debug) {
            console.log("[EventBus] clearAll");
        }
        this.subscribers.clear();
        this.buffer.clear();
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
export function createEventBus(options) {
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
export function createTypedEventBus(options) {
    return new DefaultEventBus(options);
}
// =============================================================================
// Global Event Bus
// =============================================================================
/**
 * Global event bus singleton.
 * Use for application-wide event coordination.
 */
let globalBus;
/**
 * Get or create the global event bus.
 *
 * @param options - Options for creating the bus (only used on first call)
 * @returns Global EventBus instance
 */
export function getGlobalEventBus(options) {
    if (!globalBus) {
        globalBus = createEventBus(options);
    }
    return globalBus;
}
/**
 * Reset the global event bus.
 * Useful for testing.
 */
export function resetGlobalEventBus() {
    globalBus?.clearAll();
    globalBus = undefined;
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
export function createChannelPrefix(bus, prefix) {
    const prefixed = (channel) => `${prefix}:${channel}`;
    return {
        emit(channel, data) {
            bus.emit(prefixed(channel), data);
        },
        on(channel, handler) {
            return bus.on(prefixed(channel), handler);
        },
        once(channel) {
            return bus.once(prefixed(channel));
        },
        stream(channel) {
            return bus.stream(prefixed(channel));
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
export function forwardChannel(bus, from, to) {
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
export function mergeChannels(bus, sources, target) {
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
export function filterChannel(bus, source, target, predicate) {
    return bus.on(source, (data) => {
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
export function mapChannel(bus, source, target, transform) {
    return bus.on(source, (data) => {
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
export function debounceChannel(bus, source, target, delay) {
    let timer = null;
    let lastData;
    const unsub = bus.on(source, (data) => {
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
export function throttleChannel(bus, source, target, interval) {
    let lastEmit = 0;
    return bus.on(source, (data) => {
        const now = Date.now();
        if (now - lastEmit >= interval) {
            lastEmit = now;
            bus.emit(target, data);
        }
    });
}
//# sourceMappingURL=bus.js.map