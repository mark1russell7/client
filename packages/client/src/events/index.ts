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
  EventFanOutOptions,
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
export type { RightsChange, RightsScope, RightsScopes, SubscriptionRecheck } from "./recheck.js";
// The live state: keyed values in memory on a topic, with a snapshot and a time limit (LIVE-STATE-2026-11.md)
export {
  DEFAULT_LIVE_KEYS,
  DEFAULT_LIVE_TOPICS,
  DEFAULT_LIVE_VALUE_BYTES,
  LIVE_SET_PATH,
  LIVE_SNAPSHOT_PATH,
  LIVE_LEAVE_PATH,
  LiveState,
  MAX_LIVE_KEY_LENGTH,
  liveTopic,
  liveTopicTarget,
} from "./live-state.js";
export type {
  AdmitLiveSet,
  AdmitLiveLeave,
  LiveLeaveCall,
  LiveAdmission,
  LiveEntry,
  LiveEvent,
  LiveGone,
  LiveGoneReason,
  LiveSetCall,
  LiveSetOptions,
  LiveStateHost,
  LiveStateOptions,
} from "./live-state.js";
export { liveView } from "./live-view.js";
export type { LiveClient, LiveView, LiveViewOptions } from "./live-view.js";
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
