/**
 * The publisher of the remote events (`documentation/EVENTS.md`).
 *
 * An `EventPublisher` serves the procedure `events.subscribe` from an event bus. A host gives it
 * to `ProcedureServer` (the option `events`) or to `LocalTransport`. Each subscription is a stream
 * without an end: its first item confirms the listeners, and each other item is one event of the
 * bus.
 *
 * - The topic rule (`topics`) is the expose rule of the topics. A topic outside it gives
 *   `TOPIC_NOT_FOUND`.
 * - `allow` examines each topic with the capability of the call. A refusal gives `FORBIDDEN` with
 *   the reason `topic-not-allowed`.
 * - The procedure declares that it reads the resource `events`, so the capability of the host
 *   applies to it as to each procedure.
 *
 * The delivery is at most once. The queue of a subscription holds at most `buffer` events. When
 * it is full, the publisher drops the oldest event, and the next event tells the number of lost
 * events (`dropped`). The bus never waits for a subscriber.
 */

import { z } from "zod";
import { createProcedure } from "../procedures/define.js";
import { InvocationError } from "../procedures/invoke.js";
import type { AnyProcedure, Capability, ProcedureContext } from "../procedures/types.js";
import type { EventBus, Unsubscribe } from "./types.js";
import { getGlobalEventBus } from "./bus.js";
import { EVENTS_SUBSCRIBE_PATH, type EventItem, type SubscribeInput } from "./remote.js";

/** The number of topics that one subscription can name. */
export const MAX_SUBSCRIPTION_TOPICS = 64;

/** The number of characters of a topic name. */
export const MAX_TOPIC_LENGTH = 256;

/**
 * The topics that a publisher serves: a list of patterns, or a function. A pattern is an exact
 * name (`orders.created`), a prefix that ends with `*` (`orders.*`), or `*` for each topic.
 */
export type TopicRule = readonly string[] | ((topic: string) => boolean);

/** What `allow` knows about the call of a subscription. */
export interface TopicCall {
  /** The capability of the call: its clearance, its permitted effects and its deadline. */
  readonly capability: Capability;
  /** The metadata of the call: the connection id and the headers of a network request. */
  readonly metadata: Readonly<Record<string, unknown>>;
}

/** The options of an `EventPublisher`. */
export interface EventPublisherOptions {
  /** The bus that the subscriptions read. The default is the global bus of `getGlobalEventBus()`. */
  bus?: EventBus | undefined;
  /** The topics that a peer can subscribe to. A topic outside the rule gives `TOPIC_NOT_FOUND`. */
  topics: TopicRule;
  /**
   * This function tells if a call can subscribe to a topic of the rule, for example from the
   * clearance of its capability. A refusal gives `FORBIDDEN` with the reason `topic-not-allowed`.
   * Without it, each call can subscribe to each topic of the rule.
   */
  allow?: ((topic: string, call: TopicCall) => boolean) | undefined;
  /**
   * The number of events that one subscription holds for a slow subscriber. When the queue is
   * full, the publisher drops the oldest event.
   * @default 1024
   */
  buffer?: number | undefined;
}

/** This function gives the test of a topic rule. */
export function topicMatcher(rule: TopicRule): (topic: string) => boolean {
  if (typeof rule === "function") return rule;
  const exact = new Set<string>();
  const prefixes: string[] = [];
  let all = false;
  for (const pattern of rule) {
    if (pattern === "*") all = true;
    else if (pattern.endsWith("*")) prefixes.push(pattern.slice(0, -1));
    else exact.add(pattern);
  }
  return (topic) => all || exact.has(topic) || prefixes.some((prefix) => topic.startsWith(prefix));
}

/** The error of a topic outside the topic rule. */
class TopicNotFoundError extends Error {
  override readonly name = "TopicNotFoundError";
  readonly code = "TOPIC_NOT_FOUND";
  readonly retryable = false;
}

/** The error that ends each subscription when the publisher stops. A resubscribe can succeed later. */
function stoppedError(): Error {
  return Object.assign(new Error("The publisher of the events stops"), { code: "UNAVAILABLE", retryable: true });
}

const topicSchema = z.string().min(1).max(MAX_TOPIC_LENGTH);

const subscribeInput = z.object({
  topics: z.array(topicSchema).min(1).max(MAX_SUBSCRIPTION_TOPICS).describe("The topics of the subscription"),
});

const eventItemSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("subscribed"),
    topics: z.array(z.string()).describe("The topics that the publisher listens to for this subscription"),
  }),
  z.object({
    type: z.literal("event"),
    topic: z.string(),
    data: z.unknown(),
    seq: z.number().int().describe("The number of the event in the subscription, from 1"),
    dropped: z.number().int().optional().describe("The events that the publisher dropped immediately before this one"),
  }),
]);

/**
 * One subscription: the listeners on the bus and the queue of its events. It is the async
 * iterator of the stream of the call. `return()`, the abort of the signal of the call and
 * `fail()` remove the listeners.
 */
class TopicSubscription implements AsyncIterableIterator<EventItem> {
  private confirmation: EventItem | undefined;
  private readonly queue: Array<Extract<EventItem, { type: "event" }>> = [];
  private seq = 0;
  private dropped = 0;
  private waiter: { resolve: (result: IteratorResult<EventItem>) => void; reject: (error: unknown) => void } | undefined;
  private closed = false;
  private failure: unknown;
  private readonly unsubscribes: Unsubscribe[];

  constructor(
    bus: EventBus,
    topics: readonly string[],
    private readonly buffer: number,
    private readonly signal: AbortSignal | undefined,
    private readonly onClose: (subscription: TopicSubscription) => void,
  ) {
    this.confirmation = { type: "subscribed", topics };
    this.unsubscribes = topics.map((topic) => bus.on(topic, (data) => this.push(topic, data)));
    signal?.addEventListener("abort", this.onAbort, { once: true });
  }

  /** This function closes a subscription whose call aborted before it started. */
  closeIfAborted(): this {
    if (this.signal?.aborted) this.close();
    return this;
  }

  private readonly onAbort = (): void => this.close();

  /** This function takes one event of the bus. It never waits. */
  private push(topic: string, data: unknown): void {
    if (this.closed) return;
    const event = { type: "event" as const, topic, data, seq: ++this.seq };
    const waiter = this.waiter;
    if (waiter && this.queue.length === 0) {
      this.waiter = undefined;
      waiter.resolve({ value: this.withDropped(event), done: false });
      return;
    }
    if (this.queue.length >= this.buffer) {
      // A slow subscriber: the oldest event goes, and the next event tells the loss
      this.queue.shift();
      this.dropped++;
    }
    this.queue.push(event);
  }

  /** The event with the number of events that the publisher dropped before it. */
  private withDropped(event: Extract<EventItem, { type: "event" }>): EventItem {
    if (this.dropped === 0) return event;
    const dropped = this.dropped;
    this.dropped = 0;
    return { ...event, dropped };
  }

  next(): Promise<IteratorResult<EventItem>> {
    if (this.confirmation) {
      const confirmation = this.confirmation;
      this.confirmation = undefined;
      return Promise.resolve({ value: confirmation, done: false });
    }
    const event = this.queue.shift();
    if (event) return Promise.resolve({ value: this.withDropped(event), done: false });
    if (this.failure !== undefined) {
      const failure = this.failure;
      this.failure = undefined;
      return Promise.reject(failure);
    }
    if (this.closed) return Promise.resolve({ value: undefined, done: true });
    return new Promise((resolve, reject) => {
      this.waiter = { resolve, reject };
    });
  }

  return(): Promise<IteratorResult<EventItem>> {
    this.close();
    return Promise.resolve({ value: undefined, done: true });
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<EventItem> {
    return this;
  }

  /** This function ends the subscription with an error: the reader gets it at its next item. */
  fail(error: unknown): void {
    if (this.closed) return;
    const waiter = this.waiter;
    this.waiter = undefined;
    this.release();
    this.queue.length = 0;
    this.confirmation = undefined;
    if (waiter) waiter.reject(error);
    else this.failure = error;
  }

  /** This function ends the subscription without an error. */
  close(): void {
    if (this.closed) return;
    const waiter = this.waiter;
    this.waiter = undefined;
    this.release();
    this.queue.length = 0;
    this.confirmation = undefined;
    waiter?.resolve({ value: undefined, done: true });
  }

  /** This function removes the listeners from the bus and from the signal. */
  private release(): void {
    this.closed = true;
    for (const unsubscribe of this.unsubscribes) unsubscribe();
    this.signal?.removeEventListener("abort", this.onAbort);
    this.onClose(this);
  }
}

/**
 * The publisher of the remote events: it serves `events.subscribe` from a bus, under a topic
 * rule. `ProcedureServer` makes one from its option `events`.
 *
 * @example
 * ```typescript
 * const publisher = new EventPublisher({ bus, topics: ["orders.*"] });
 * const server = new ProcedureServer({ registry, autoRegister: true, events: publisher });
 * publisher.publish("orders.created", { order: 1 });
 * ```
 */
export class EventPublisher {
  /** The bus that the subscriptions read. */
  readonly bus: EventBus;
  /** The procedure `events.subscribe` of this publisher. A host pins it, outside its registry. */
  readonly procedure: AnyProcedure;
  private readonly known: (topic: string) => boolean;
  private readonly allow: EventPublisherOptions["allow"];
  private readonly buffer: number;
  private readonly open = new Set<TopicSubscription>();

  constructor(options: EventPublisherOptions) {
    this.bus = options.bus ?? getGlobalEventBus();
    this.known = topicMatcher(options.topics);
    this.allow = options.allow;
    this.buffer = Math.max(1, Math.floor(options.buffer ?? 1024));
    this.procedure = createProcedure()
      .path([...EVENTS_SUBSCRIBE_PATH])
      .input(subscribeInput)
      .output(eventItemSchema)
      .meta({
        description: "A subscription to topics of the event bus of the host: a stream without an end, with one item for each event",
        effects: { reads: ["events"], writes: [] },
        stream: { unbounded: true },
      })
      .handler((async (input: SubscribeInput, ctx: ProcedureContext) => this.subscribe(input.topics, ctx)) as never)
      .build() as AnyProcedure;
  }

  /** This function publishes an event on the bus: each subscription of the topic gets it. */
  publish<T>(topic: string, data: T): void {
    this.bus.emit(topic, data);
  }

  /** The number of open subscriptions. */
  get subscriptions(): number {
    return this.open.size;
  }

  /**
   * This function ends each open subscription with a retryable `UNAVAILABLE`: the publisher stops.
   * A subscriber resubscribes after its backoff. `ProcedureServer.stop()` calls it first.
   */
  end(): void {
    for (const subscription of [...this.open]) subscription.fail(stoppedError());
  }

  /**
   * The stream of one subscription. The publisher examines each topic before it adds a listener:
   * the topic rule first, then `allow`. A call with one bad topic makes no subscription.
   */
  private subscribe(topics: readonly string[], ctx: ProcedureContext): TopicSubscription {
    const unique = [...new Set(topics)];
    for (const topic of unique) {
      if (!this.known(topic)) throw new TopicNotFoundError(`The host has no topic "${topic}"`);
    }
    if (this.allow) {
      const call: TopicCall = { capability: ctx.capability, metadata: ctx.metadata };
      for (const topic of unique) {
        if (!this.allow(topic, call)) {
          throw new InvocationError("FORBIDDEN", `The capability of the call does not permit the topic "${topic}"`, ctx.path, "topic-not-allowed");
        }
      }
    }
    const subscription = new TopicSubscription(this.bus, unique, this.buffer, ctx.signal, (closed) => this.open.delete(closed));
    this.open.add(subscription);
    return subscription.closeIfAborted();
  }
}
