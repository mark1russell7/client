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
  EventListenOptions,
  EventWaitOptions,
} from "./types.js";

// Implementation
export { DefaultEventBus } from "./bus.js";

// Factory functions
export {
  createEventBus,
  createTypedEventBus,
  getGlobalEventBus,
  resetGlobalEventBus,
  withEventBusSignal,
} from "./bus.js";

// The remote events: a peer subscribes to the topics of the bus of another peer (EVENTS.md)
export { EventPublisher, topicMatcher, MAX_SUBSCRIPTION_TOPICS, MAX_TOPIC_LENGTH } from "./publisher.js";
export type { EventPublisherOptions, TopicRule, TopicCall } from "./publisher.js";
export type { RightsChange, SubscriptionRecheck } from "./recheck.js";
export { EVENTS_SUBSCRIBE_PATH, SubscriptionError, remoteEvents, subscribeRemote } from "./remote.js";
export type {
  EventItem,
  EventTransport,
  RemoteEvent,
  RemoteEventHandler,
  RemoteEventsOptions,
  ResubscribeBackoff,
  SubscribeInput,
  SubscribeOptions,
  Subscription,
  SubscriptionHooks,
} from "./remote.js";

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
export type { ChannelTimingOptions } from "./bus.js";
