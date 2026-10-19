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
 * - `reads` gives the resources that a subscriber of a topic reads. The capability of the call
 *   must permit them, as for a procedure that reads them (roadmap CLI-15). By default, a topic
 *   `collections.<name>` reads `collection:<name>`.
 * - `allow` examines each topic with the capability of the call. A refusal gives `FORBIDDEN` with
 *   the reason `topic-not-allowed`.
 * - The procedure declares that it reads the resource `events`, so the capability of the host
 *   applies to it as to each procedure.
 *
 * - A value with rows (`withRows()`) reaches each subscriber through the output filter of its host
 *   (`ctx.admit`): each row passes the filter, and the subscriber gets only the admitted rows.
 * - An open subscription gets the same checks again at a change of the rights (`rightsChanged()`,
 *   `recheck.rightsChanges`) and after `recheck.maxAge` (roadmap CLI-44). A refusal ends it.
 *
 * The delivery is at most once. The queue of a subscription holds at most `buffer` events. When
 * it is full, the publisher drops the oldest event, and the next event tells the number of lost
 * events (`dropped`). The bus never waits for a subscriber.
 */

import { z } from "zod";
import { createProcedure } from "../procedures/define.js";
import { InvocationError, type Invocation } from "../procedures/invoke.js";
import { capabilityRefusal } from "../procedures/capability.js";
import { collectionChangeTopic, collectionTopicReads } from "../procedures/collection/changes.js";
import { collectionTopicTarget, partitionOfCall } from "../procedures/collection/partition.js";
import type { AnyProcedure, Capability, ProcedureContext } from "../procedures/types.js";
import type { Principal } from "../server/types.js";
import type { EventBus, Unsubscribe } from "./types.js";
import { getGlobalEventBus } from "./bus.js";
import { EVENTS_SUBSCRIBE_PATH, type EventItem, type SubscribeInput } from "./remote.js";
import { admittedValue, rowsOf } from "./rows.js";
import { realClock, type Clock } from "../clock.js";
import { SubscriptionRechecks, type RightsChange, type SubscriptionRecheck } from "./recheck.js";

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
  /** The principal of the call, from the authentication of the host. */
  readonly principal?: Principal | undefined;
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
   * full, the publisher drops the oldest event. The events that wait for a re-check (roadmap
   * CLI-44) are in the same queue, so a slow check holds at most this number of events too.
   * @default 1024
   */
  buffer?: number | undefined;
  /**
   * The resources that a subscriber of a topic reads (roadmap CLI-15). The publisher refuses a
   * topic whose reads the capability of the call does not permit, as for a procedure that reads
   * them: `FORBIDDEN` with the reason `effects-exceeded`.
   *
   * A custom function gets only the topic. For a topic of a collection, give the read of the
   * collection that the publisher listens to: the collection of `collectionTopicTarget(topic,
   * repository)` with the repository of the host. A function that reads the first part of the
   * topic alone checks `collection:a` for the dotted collection `a.b`.
   * @default `collectionTopicReads(topic, repository)`: the read of the collection of `collectionTopicTarget()`, with the repository of the call
   */
  reads?: ((topic: string) => readonly string[]) | undefined;
  /**
   * The clock of the re-check after `recheck.maxAge` (roadmap CLI-44). A test gives the
   * `fakeClock` of `@mark1russell7/service/testing`. A `ProcedureServer` gives its own clock to the
   * publisher that it makes from its option `events`.
   * @default the clock of the platform
   */
  clock?: Clock | undefined;
  /**
   * The re-check of the admission of each open subscription (roadmap CLI-44). A right can change
   * after the start of a subscription. The publisher then examines the subscription again with the
   * same checks: the topic rule, the reads, `allow` and the partition. A refusal ends it, for
   * example with `FORBIDDEN`. `maxAge` starts a check after a time on the clock, and
   * `rightsChanges` starts a check at each change from a source of the app. `rightsChanged()` also
   * starts a check.
   * @default no check after the start, other than at a call of `rightsChanged()`
   */
  recheck?: SubscriptionRecheck | undefined;
}

/** A procedure that reads resources, for the admission of a topic under a capability. */
function topicReader(reads: readonly string[]): AnyProcedure {
  return { path: [...EVENTS_SUBSCRIBE_PATH], metadata: { effects: { reads: [...reads], writes: [] } } } as unknown as AnyProcedure;
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

/**
 * The error that ends a subscription when `clear()` or `clearAll()` of the bus removes the
 * listener of one of its topics. The subscriber does not resubscribe: the host removed the topic.
 */
function clearedError(topic: string): Error {
  return Object.assign(new Error(`The host cleared the topic "${topic}", so the subscription ends`), { code: "TOPIC_CLEARED", retryable: false });
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
 * `fail()` remove the listeners. When `clear()` of the bus removes a listener, the subscription
 * gives the events of its queue, and then it ends with `TOPIC_CLEARED`.
 */
class TopicSubscription implements AsyncIterableIterator<EventItem> {
  private confirmation: EventItem | undefined;
  private readonly queue: Array<Extract<EventItem, { type: "event" }>> = [];
  private seq = 0;
  private dropped = 0;
  private waiter:
    | { resolve: (result: IteratorResult<EventItem> | PromiseLike<IteratorResult<EventItem>>) => void; reject: (error: unknown) => void }
    | undefined;
  private closed = false;
  private failure: unknown;
  private readonly unsubscribes: Unsubscribe[];
  /** The re-check of the admission that runs (roadmap CLI-44). The events wait for it. */
  private recheck: Promise<void> | undefined;
  /** The functions that run when the subscription ends */
  private readonly endListeners: Array<() => void> = [];

  constructor(
    bus: EventBus,
    /** The topics of the subscriber, each with the topic of the bus that it listens to */
    routes: ReadonlyArray<readonly [topic: string, busTopic: string]>,
    private readonly buffer: number,
    private readonly signal: AbortSignal | undefined,
    private readonly onClose: (subscription: TopicSubscription) => void,
    /** The output filter of the host for this subscriber: each row of a value passes it */
    private readonly admit: ((item: unknown) => Promise<boolean>) | undefined,
    /** The invocation of the subscription: the rule of the rows of a value gets it (roadmap CLI-41) */
    private readonly invocation?: Invocation | undefined,
  ) {
    this.confirmation = { type: "subscribed", topics: routes.map(([topic]) => topic) };
    // Before, clear() removed the listeners, and the subscriber saw no end (EVENTS.md)
    this.unsubscribes = routes.map(([topic, busTopic]) =>
      bus.on(busTopic, (data) => this.push(topic, data), { onClear: () => this.fail(clearedError(topic), { keepQueue: true }) }),
    );
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
    if (waiter && this.queue.length === 0 && !this.recheck) {
      this.waiter = undefined;
      waiter.resolve(this.deliver(event));
      return;
    }
    if (this.queue.length >= this.buffer) {
      // A slow subscriber: the oldest event goes, and the next event tells the loss
      this.queue.shift();
      this.dropped++;
    }
    this.queue.push(event);
  }

  /**
   * The item of an event for the subscriber. The rows of its data pass the output filter of the
   * host for this subscriber and the rule of the rows, and the subscriber gets only the admitted rows.
   */
  private deliver(event: Extract<EventItem, { type: "event" }>): Promise<IteratorResult<EventItem>> {
    const item = this.withDropped(event) as Extract<EventItem, { type: "event" }>;
    const rows = rowsOf(item.data);
    if (!rows || (!this.admit && !rows.admit)) return Promise.resolve({ value: item, done: false });
    return admittedValue(item.data, this.admit, this.invocation).then((data): IteratorResult<EventItem> => ({ value: { ...item, data }, done: false }));
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
    // The events wait for a re-check of the admission (roadmap CLI-44)
    if (this.recheck) return this.recheck.then(() => this.next());
    const event = this.queue.shift();
    if (event) return this.deliver(event);
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

  /**
   * This function ends the subscription with an error: the reader gets it at its next item. With
   * `keepQueue`, the reader first gets the confirmation and the events of the queue.
   */
  fail(error: unknown, options: { keepQueue?: boolean } = {}): void {
    if (this.closed) return;
    const waiter = this.waiter;
    this.waiter = undefined;
    this.release();
    if (!options.keepQueue) {
      this.queue.length = 0;
      this.confirmation = undefined;
    }
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
    for (const listener of this.endListeners.splice(0)) listener();
  }

  /**
   * This function holds the events until the check ends (roadmap CLI-44). A check that passes gives
   * the held events to the reader. A check that fails ends the subscription with its error, and the
   * held events go. The promise ends when the check ends, and it does not reject.
   */
  hold(check: Promise<void>): Promise<void> {
    if (this.closed) return check.then(ignore, ignore);
    const running: Promise<void> = check.then(
      () => {
        if (this.recheck === running) this.recheck = undefined;
        this.flush();
      },
      (error: unknown) => {
        if (this.recheck === running) this.recheck = undefined;
        this.queue.length = 0;
        this.fail(error);
      },
    );
    this.recheck = running;
    return running;
  }

  /** This function runs the listener when the subscription ends, or at once after its end. */
  onEnd(listener: () => void): void {
    if (this.closed) listener();
    else this.endListeners.push(listener);
  }

  /** This function gives the first held event to a reader that waits, after a check passes. */
  private flush(): void {
    const waiter = this.waiter;
    const event = this.queue[0];
    if (!waiter || !event || this.recheck) return;
    this.waiter = undefined;
    this.queue.shift();
    waiter.resolve(this.deliver(event));
  }
}

/** This function does nothing: the end of a check of a closed subscription. */
function ignore(): void {}

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
  private readonly reads: (topic: string) => readonly string[];
  /** True when the reads come from the topic rule of the collections (no option `reads`) */
  private readonly defaultReads: boolean;
  private readonly buffer: number;
  private readonly open = new Set<TopicSubscription>();
  /** The re-checks of the admission of the open subscriptions (roadmap CLI-44) */
  private readonly rechecks: SubscriptionRechecks;

  constructor(options: EventPublisherOptions) {
    this.rechecks = new SubscriptionRechecks(options.recheck ?? {}, options.clock ?? realClock);
    this.bus = options.bus ?? getGlobalEventBus();
    this.known = topicMatcher(options.topics);
    this.allow = options.allow;
    this.reads = options.reads ?? collectionTopicReads;
    this.defaultReads = options.reads === undefined;
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
   * This function tells the publisher that rights changed (roadmap CLI-44). Each open subscription
   * that the change touches gets the checks of its start again: the topic rule, the reads, `allow`
   * and the partition. Its events wait for the check. A refusal ends the subscription with its
   * error, for example `FORBIDDEN`. The promise ends when each check ends, and it does not reject.
   *
   * @param change - The subscriptions that the change touches. Without it, each open subscription gets a check.
   */
  rightsChanged(change?: RightsChange): Promise<void> {
    return this.rechecks.rightsChanged(change);
  }

  /**
   * The topic of the bus for a topic of a subscriber (roadmap CLI-17). A topic of a partitioned
   * collection names the partition that the subscriber asks for, as the input of a procedure does:
   * the resolver of the repository gives the partition, so a subscriber cannot name the topic of
   * another tenant. A collection without partitions refuses a topic with a partition.
   */
  private async busTopic(topic: string, ctx: ProcedureContext): Promise<string> {
    const target = collectionTopicTarget(topic, ctx.repository);
    if (!target) return topic;
    const partition = await partitionOfCall(ctx, target.collection, target.partition);
    return collectionChangeTopic(target.collection, partition);
  }

  /**
   * The resources that a subscriber of a topic reads. The default (`collectionTopicReads`) reads
   * the collection of the topic with the rule of the listener (`collectionTopicTarget`) and the
   * repository of the call, so the read check and the listener name the same collection.
   */
  private readsOf(topic: string, ctx: ProcedureContext): readonly string[] {
    if (!this.defaultReads) return this.reads(topic);
    return collectionTopicReads(topic, ctx.repository);
  }

  /**
   * The checks of the topics of a call: the topic rule, the reads of the capability and `allow`.
   * A subscription passes them at its start and at each re-check (roadmap CLI-44).
   */
  private admitTopics(unique: readonly string[], ctx: ProcedureContext): void {
    for (const topic of unique) {
      if (!this.known(topic)) throw new TopicNotFoundError(`The host has no topic "${topic}"`);
    }
    // A subscriber of a topic reads its resources: the capability of the call must permit them
    for (const topic of unique) {
      const reads = this.readsOf(topic, ctx);
      if (reads.length === 0) continue;
      const refusal = capabilityRefusal(topicReader(reads), ctx.capability);
      if (refusal) throw new InvocationError("FORBIDDEN", `The topic "${topic}": ${refusal.message}`, ctx.path, refusal.reason);
    }
    if (this.allow) {
      const call: TopicCall = { capability: ctx.capability, metadata: ctx.metadata, ...(ctx.principal ? { principal: ctx.principal } : {}) };
      for (const topic of unique) {
        if (!this.allow(topic, call)) {
          throw new InvocationError("FORBIDDEN", `The capability of the call does not permit the topic "${topic}"`, ctx.path, "topic-not-allowed");
        }
      }
    }
  }

  /**
   * The admission of an open subscription again (roadmap CLI-44): the checks of its start, and the
   * partition of each topic. A refusal of the resolver throws its error. A topic whose partition
   * changed throws `FORBIDDEN` (reason `partition-not-allowed`), because the listener has the old
   * partition.
   */
  private async readmit(routes: ReadonlyArray<readonly [string, string]>, ctx: ProcedureContext): Promise<void> {
    this.admitTopics(routes.map(([topic]) => topic), ctx);
    for (const [topic, busTopic] of routes) {
      if ((await this.busTopic(topic, ctx)) !== busTopic) {
        throw new InvocationError("FORBIDDEN", `The partition of the topic "${topic}" changed, so the subscription ends`, ctx.path, "partition-not-allowed");
      }
    }
  }

  /**
   * The stream of one subscription. The publisher examines each topic before it adds a listener:
   * the topic rule, the reads, `allow`, and the partition. A call with one bad topic makes no subscription.
   */
  private async subscribe(topics: readonly string[], ctx: ProcedureContext): Promise<TopicSubscription> {
    const unique = [...new Set(topics)];
    this.admitTopics(unique, ctx);
    const routes: Array<readonly [string, string]> = [];
    for (const topic of unique) routes.push([topic, await this.busTopic(topic, ctx)]);
    const subscription = new TopicSubscription(this.bus, routes, this.buffer, ctx.signal, (closed) => this.open.delete(closed), ctx.admit, ctx.invocation);
    this.open.add(subscription);
    // The same checks run again at a change of the rights and after the max age (roadmap CLI-44)
    this.rechecks.watch(subscription, ctx.principal, () => this.readmit(routes, ctx));
    return subscription.closeIfAborted();
  }
}
