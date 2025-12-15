/**
 * Event Bus Implementation
 *
 * Central pub/sub system for streaming coordination.
 */
import type { EventBus, TypedEventBus, ChannelMap, EventHandler, Unsubscribe, EventBusOptions } from "./types.js";
/**
 * Default event bus implementation.
 * Supports pub/sub messaging with async iteration.
 */
export declare class DefaultEventBus implements EventBus {
    private readonly subscribers;
    private readonly buffer;
    private readonly options;
    constructor(options?: EventBusOptions);
    /**
     * Emit an event on a channel.
     */
    emit<T>(channel: string, data: T): void;
    /**
     * Subscribe to events on a channel.
     */
    on<T>(channel: string, handler: EventHandler<T>): Unsubscribe;
    /**
     * Subscribe to a single event on a channel.
     */
    once<T>(channel: string): Promise<T>;
    /**
     * Create an async iterable for a channel.
     */
    stream<T>(channel: string): AsyncIterable<T>;
    /**
     * Get the number of subscribers on a channel.
     */
    subscriberCount(channel: string): number;
    /**
     * Check if a channel has any subscribers.
     */
    hasSubscribers(channel: string): boolean;
    /**
     * Get all active channel names.
     */
    channels(): string[];
    /**
     * Remove all subscribers from a channel.
     */
    clear(channel: string): void;
    /**
     * Remove all subscribers from all channels.
     */
    clearAll(): void;
}
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
export declare function createEventBus(options?: EventBusOptions): EventBus;
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
export declare function createTypedEventBus<TChannels extends ChannelMap>(options?: EventBusOptions): TypedEventBus<TChannels>;
/**
 * Get or create the global event bus.
 *
 * @param options - Options for creating the bus (only used on first call)
 * @returns Global EventBus instance
 */
export declare function getGlobalEventBus(options?: EventBusOptions): EventBus;
/**
 * Reset the global event bus.
 * Useful for testing.
 */
export declare function resetGlobalEventBus(): void;
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
export declare function createChannelPrefix(bus: EventBus, prefix: string): {
    emit<T>(channel: string, data: T): void;
    on<T>(channel: string, handler: EventHandler<T>): Unsubscribe;
    once<T>(channel: string): Promise<T>;
    stream<T>(channel: string): AsyncIterable<T>;
};
/**
 * Forward events from one channel to another.
 *
 * @param bus - Event bus
 * @param from - Source channel
 * @param to - Destination channel
 * @returns Unsubscribe function
 */
export declare function forwardChannel(bus: EventBus, from: string, to: string): Unsubscribe;
/**
 * Merge multiple channels into one.
 *
 * @param bus - Event bus
 * @param sources - Source channels
 * @param target - Target channel
 * @returns Unsubscribe function for all sources
 */
export declare function mergeChannels(bus: EventBus, sources: string[], target: string): Unsubscribe;
/**
 * Filter events on a channel.
 *
 * @param bus - Event bus
 * @param source - Source channel
 * @param target - Target channel
 * @param predicate - Filter function
 * @returns Unsubscribe function
 */
export declare function filterChannel<T>(bus: EventBus, source: string, target: string, predicate: (data: T) => boolean): Unsubscribe;
/**
 * Transform events from one channel to another.
 *
 * @param bus - Event bus
 * @param source - Source channel
 * @param target - Target channel
 * @param transform - Transform function
 * @returns Unsubscribe function
 */
export declare function mapChannel<TIn, TOut>(bus: EventBus, source: string, target: string, transform: (data: TIn) => TOut): Unsubscribe;
/**
 * Debounce events on a channel.
 *
 * @param bus - Event bus
 * @param source - Source channel
 * @param target - Target channel
 * @param delay - Debounce delay in milliseconds
 * @returns Unsubscribe function
 */
export declare function debounceChannel<T>(bus: EventBus, source: string, target: string, delay: number): Unsubscribe;
/**
 * Throttle events on a channel.
 *
 * @param bus - Event bus
 * @param source - Source channel
 * @param target - Target channel
 * @param interval - Throttle interval in milliseconds
 * @returns Unsubscribe function
 */
export declare function throttleChannel<T>(bus: EventBus, source: string, target: string, interval: number): Unsubscribe;
//# sourceMappingURL=bus.d.ts.map