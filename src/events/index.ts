/**
 * Events Module
 *
 * Central pub/sub system for streaming coordination.
 *
 * @example
 * ```typescript
 * import { createEventBus, createTypedEventBus } from "client/events";
 *
 * // Simple usage
 * const bus = createEventBus();
 * bus.on("updates", (data) => console.log(data));
 * bus.emit("updates", { message: "Hello" });
 *
 * // Typed channels
 * interface MyChannels {
 *   "user:created": { id: string; name: string };
 *   "user:updated": { id: string; changes: Record<string, unknown> };
 * }
 *
 * const typedBus = createTypedEventBus<MyChannels>();
 * typedBus.emit("user:created", { id: "1", name: "John" }); // Type-safe
 *
 * // Streaming iteration
 * for await (const update of bus.stream("updates")) {
 *   console.log(update);
 * }
 * ```
 */

// Types
export type {
  Event,
  EventHandler,
  Unsubscribe,
  EventBus,
  TypedEventBus,
  ChannelMap,
  SystemChannels,
  ProcedureChannels,
  DefaultChannels,
  EventBusOptions,
} from "./types.js";

// Implementation
export { DefaultEventBus } from "./bus.js";

// Factory functions
export {
  createEventBus,
  createTypedEventBus,
  getGlobalEventBus,
  resetGlobalEventBus,
} from "./bus.js";

// Utilities
export {
  createChannelPrefix,
  forwardChannel,
  mergeChannels,
  filterChannel,
  mapChannel,
  debounceChannel,
  throttleChannel,
} from "./bus.js";
