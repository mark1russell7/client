/**
 * Typed event emitter system for collections.
 *
 * Provides a lightweight, type-safe event system for mutation events
 * and other observable behavior. Events are strongly typed using
 * TypeScript's mapped types.
 */
/**
 * A listener function that receives an event payload.
 */
export type Listener<P> = (payload: P) => void;
/**
 * A function to unsubscribe from an event.
 */
export type Unsubscribe = () => void;
/**
 * Event map defining event names and their payload types.
 *
 * @example
 * interface MyEvents {
 *   add: { value: number; index: number }
 *   remove: { value: number }
 *   clear: {}
 * }
 */
export type EventMap = Record<string, any>;
/**
 * Type-safe event emitter.
 *
 * Supports subscribing to events, emitting events, and managing listeners.
 * All event names and payloads are type-checked at compile time.
 *
 * @example
 * interface ListEvents<T> {
 *   add: { value: T; index: number }
 *   remove: { value: T; index: number }
 *   clear: {}
 * }
 *
 * const emitter = new Emitter<ListEvents<number>>()
 *
 * const unsub = emitter.on('add', ({ value, index }) => {
 *   console.log(`Added ${value} at ${index}`)
 * })
 *
 * emitter.emit('add', { value: 42, index: 0 })
 * unsub() // Unsubscribe
 */
export declare class Emitter<E extends EventMap> {
    private listeners;
    /**
     * Subscribe to an event.
     *
     * @param event The event name
     * @param listener The callback to invoke when event is emitted
     * @returns A function to unsubscribe
     */
    on<K extends keyof E>(event: K, listener: Listener<E[K]>): Unsubscribe;
    /**
     * Subscribe to an event, but automatically unsubscribe after first emission.
     *
     * @param event The event name
     * @param listener The callback to invoke once
     * @returns A function to unsubscribe (in case you want to cancel before emission)
     */
    once<K extends keyof E>(event: K, listener: Listener<E[K]>): Unsubscribe;
    /**
     * Emit an event to all registered listeners.
     *
     * @param event The event name
     * @param payload The event payload
     */
    emit<K extends keyof E>(event: K, payload: E[K]): void;
    /**
     * Remove all listeners for a specific event, or all events if no event specified.
     *
     * @param event Optional event name to clear listeners for
     */
    off<K extends keyof E>(event?: K): void;
    /**
     * Get the number of listeners for a specific event.
     *
     * @param event The event name
     * @returns Number of registered listeners
     */
    listenerCount<K extends keyof E>(event: K): number;
    /**
     * Get all event names that have at least one listener.
     */
    eventNames(): (keyof E)[];
    /**
     * Check if there are any listeners for a specific event.
     */
    hasListeners<K extends keyof E>(event: K): boolean;
    /**
     * Remove all listeners and clean up resources.
     */
    dispose(): void;
}
/**
 * Create an event emitter for a specific event map.
 *
 * This is a convenience factory function.
 *
 * @example
 * const events = createEmitter<ListEvents<number>>()
 */
export declare const createEmitter: <E extends EventMap>() => Emitter<E>;
/**
 * Event batching utility for reducing event noise.
 * Collects events and emits them in batches.
 *
 * @example
 * const batcher = new EventBatcher(emitter, 'add', 100)
 * batcher.queue({ value: 1, index: 0 })
 * batcher.queue({ value: 2, index: 1 })
 * // After 100ms or flush(), emits single 'batch-add' event with both items
 */
export declare class EventBatcher<E extends EventMap, K extends keyof E> {
    private emitter;
    private event;
    private delayMs;
    private batch;
    private timer;
    constructor(emitter: Emitter<E & {
        [P in `batch-${K & string}`]: E[K][];
    }>, event: K, delayMs: number);
    /**
     * Add an event to the current batch.
     */
    queue(payload: E[K]): void;
    /**
     * Immediately emit all batched events.
     */
    flush(): void;
    /**
     * Clean up resources.
     */
    dispose(): void;
}
/**
 * Async event emitter that returns promises.
 * Waits for all async listeners to complete.
 *
 * @example
 * const emitter = new AsyncEmitter<{ save: { data: string } }>()
 *
 * emitter.on('save', async ({ data }) => {
 *   await database.save(data)
 * })
 *
 * await emitter.emit('save', { data: 'test' }) // Waits for save
 */
export declare class AsyncEmitter<E extends EventMap> {
    private listeners;
    on<K extends keyof E>(event: K, listener: Listener<E[K]>): Unsubscribe;
    /**
     * Emit an event and wait for all async listeners to complete.
     *
     * @param event The event name
     * @param payload The event payload
     * @returns Promise that resolves when all listeners complete
     */
    emit<K extends keyof E>(event: K, payload: E[K]): Promise<void>;
    off<K extends keyof E>(event?: K): void;
    listenerCount<K extends keyof E>(event: K): number;
    eventNames(): (keyof E)[];
    dispose(): void;
}
/**
 * Utility to forward events from one emitter to another.
 * Useful for composing event sources.
 *
 * @example
 * const child = new Emitter<ChildEvents>()
 * const parent = new Emitter<ParentEvents>()
 *
 * forwardEvent(child, parent, 'childEvent', 'parentEvent')
 */
export declare const forwardEvent: <E1 extends EventMap, E2 extends EventMap, K1 extends keyof E1, K2 extends keyof E2>(source: Emitter<E1>, target: Emitter<E2>, sourceEvent: K1, targetEvent: K2, transform?: (payload: E1[K1]) => E2[K2]) => Unsubscribe;
/**
 * Create a filtered event subscription that only fires when predicate is true.
 *
 * @example
 * const emitter = new Emitter<{ change: { value: number } }>()
 *
 * onWhen(emitter, 'change', ({ value }) => value > 10, ({ value }) => {
 *   console.log('Value exceeded 10:', value)
 * })
 */
export declare const onWhen: <E extends EventMap, K extends keyof E>(emitter: Emitter<E>, event: K, predicate: (payload: E[K]) => boolean, listener: Listener<E[K]>) => Unsubscribe;
//# sourceMappingURL=events.d.ts.map