/**
 * Event Bus Types
 *
 * Central pub/sub system for streaming coordination.
 * Enables procedures to subscribe to events and emit updates.
 */

// =============================================================================
// Event Types
// =============================================================================

/**
 * Event payload with channel and data.
 */
export interface Event<T = unknown> {
  /** Channel the event was emitted on */
  channel: string;
  /** Event data */
  data: T;
  /** Timestamp when event was emitted */
  timestamp: number;
}

/**
 * Event handler function.
 */
export type EventHandler<T = unknown> = (data: T) => void | Promise<void>;

/**
 * Unsubscribe function returned from subscriptions.
 */
export type Unsubscribe = () => void;

// =============================================================================
// Event Bus Interface
// =============================================================================

/**
 * Central event bus for pub/sub messaging.
 *
 * Features:
 * - Type-safe channels (optional via generics)
 * - Multiple subscribers per channel
 * - Async iteration support via stream()
 * - One-time subscriptions via once()
 *
 * @example
 * ```typescript
 * const bus = new EventBus();
 *
 * // Subscribe to events
 * const unsubscribe = bus.on("user:updated", (user) => {
 *   console.log("User updated:", user);
 * });
 *
 * // Emit events
 * bus.emit("user:updated", { id: "123", name: "John" });
 *
 * // Unsubscribe
 * unsubscribe();
 *
 * // One-time subscription
 * const user = await bus.once("user:created");
 *
 * // Streaming iteration
 * for await (const update of bus.stream("updates")) {
 *   console.log("Update:", update);
 * }
 * ```
 */
export interface EventBus {
  /**
   * Emit an event on a channel.
   *
   * @param channel - Channel to emit on
   * @param data - Event data
   */
  emit<T>(channel: string, data: T): void;

  /**
   * Subscribe to events on a channel.
   *
   * @param channel - Channel to subscribe to
   * @param handler - Handler function called for each event
   * @returns Unsubscribe function
   */
  on<T>(channel: string, handler: EventHandler<T>): Unsubscribe;

  /**
   * Subscribe to a single event on a channel.
   * Returns a promise that resolves with the first event.
   *
   * @param channel - Channel to wait for
   * @returns Promise resolving to the event data
   */
  once<T>(channel: string): Promise<T>;

  /**
   * Create an async iterable for a channel.
   * Yields events as they arrive until unsubscribed.
   *
   * @param channel - Channel to stream
   * @returns AsyncIterable of event data
   */
  stream<T>(channel: string): AsyncIterable<T>;

  /**
   * Get the number of subscribers on a channel.
   *
   * @param channel - Channel to check
   * @returns Number of subscribers
   */
  subscriberCount(channel: string): number;

  /**
   * Check if a channel has any subscribers.
   *
   * @param channel - Channel to check
   */
  hasSubscribers(channel: string): boolean;

  /**
   * Get all active channel names.
   */
  channels(): string[];

  /**
   * Remove all subscribers from a channel.
   *
   * @param channel - Channel to clear
   */
  clear(channel: string): void;

  /**
   * Remove all subscribers from all channels.
   */
  clearAll(): void;
}

// =============================================================================
// Typed Channel Maps
// =============================================================================

/**
 * Channel type map for type-safe event buses.
 * Define your channels and their data types here.
 *
 * @example
 * ```typescript
 * interface MyChannels {
 *   "user:created": { id: string; name: string };
 *   "user:updated": { id: string; changes: Partial<User> };
 *   "order:placed": { orderId: string; total: number };
 * }
 *
 * const bus = createTypedEventBus<MyChannels>();
 *
 * // Type-safe emissions and subscriptions
 * bus.emit("user:created", { id: "123", name: "John" }); // ✓
 * bus.emit("user:created", { invalid: true }); // Type error
 *
 * bus.on("order:placed", (order) => {
 *   console.log(order.orderId); // ✓ typed as string
 * });
 * ```
 */
export interface ChannelMap {
  [channel: string]: unknown;
}

/**
 * Type-safe event bus with predefined channels.
 */
export interface TypedEventBus<TChannels extends ChannelMap> {
  emit<K extends keyof TChannels & string>(channel: K, data: TChannels[K]): void;
  on<K extends keyof TChannels & string>(
    channel: K,
    handler: EventHandler<TChannels[K]>
  ): Unsubscribe;
  once<K extends keyof TChannels & string>(channel: K): Promise<TChannels[K]>;
  stream<K extends keyof TChannels & string>(channel: K): AsyncIterable<TChannels[K]>;
  subscriberCount(channel: string): number;
  hasSubscribers(channel: string): boolean;
  channels(): string[];
  clear(channel: string): void;
  clearAll(): void;
}

// =============================================================================
// Built-in Channel Types
// =============================================================================

/**
 * Standard system channels.
 */
export interface SystemChannels {
  /** Error events */
  "system:error": { error: Error; context?: string };
  /** Warning events */
  "system:warning": { message: string; context?: string };
  /** Debug events */
  "system:debug": { message: string; data?: unknown };
}

/**
 * Procedure-related channels.
 */
export interface ProcedureChannels {
  /** Procedure execution started */
  "procedure:start": { path: string[]; input: unknown };
  /** Procedure execution completed */
  "procedure:complete": { path: string[]; output: unknown; duration: number };
  /** Procedure execution failed */
  "procedure:error": { path: string[]; error: Error };
  /** Procedure yielded (streaming) */
  "procedure:yield": { path: string[]; value: unknown; index: number };
}

/**
 * Default channel map combining system and procedure channels.
 */
export interface DefaultChannels extends SystemChannels, ProcedureChannels {
  // Allow additional custom channels
  [channel: string]: unknown;
}

// =============================================================================
// Event Bus Options
// =============================================================================

/**
 * Options for creating an event bus.
 */
export interface EventBusOptions {
  /**
   * Maximum number of events to buffer for late subscribers.
   * Set to 0 to disable buffering.
   * Default: 0 (no buffering)
   */
  bufferSize?: number;

  /**
   * Handler for uncaught errors in event handlers.
   * Default: console.error
   */
  onError?: (error: Error, channel: string) => void;

  /**
   * Enable debug logging.
   * Default: false
   */
  debug?: boolean;
}
