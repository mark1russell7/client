/**
 * The subscriber of the remote events (`documentation/EVENTS.md`).
 *
 * A peer subscribes to the topics of the bus of another peer with a streaming call of the
 * procedure `events.subscribe`. The first item of the stream confirms the subscription, and each
 * other item is one event. The frames are the frames of each call: credit is the backpressure,
 * and a cancel is the unsubscribe. Thus each transport with streams carries a subscription:
 * WebSocket in the two directions, HTTP with NDJSON, a message port and the local transport.
 *
 * - `remoteEvents()` gives an async iterator of the events.
 * - `subscribeRemote()` calls a handler for each event, and gives the unsubscribe function.
 *
 * The subscribers of the same topics with the same options on one transport share one call: one
 * wire subscription with a reference count. The last unsubscribe sends the cancel. Each subscriber
 * has its own queue, its own `seq`, its own `ready` and its own end.
 *
 * After a failure that a retry can repair (a closed connection, `UNAVAILABLE`, `TIMEOUT`), the
 * subscriber sends the call again after a backoff, at most `maxAttempts` times without a
 * confirmation. The delivery is at most once: the events between the failure and the new
 * confirmation are lost. Each other error ends the subscription.
 *
 * This file imports only types, the backoff, the clock and the durations, so a page or a worker
 * that subscribes stays small.
 */

import type { Message, Method, ResponseItem, Transport } from "../client/types.js";
import { backoffDelay } from "@mark1russell7/service/backoff";
import { realClock, type Clock } from "../clock.js";
import { toMs, type Duration } from "../duration.js";

/** The path of the procedure of a subscription. */
export const EVENTS_SUBSCRIBE_PATH: readonly ["events", "subscribe"] = Object.freeze(["events", "subscribe"] as const);

/** The method of the procedure of a subscription. */
const SUBSCRIBE_METHOD: Method = Object.freeze({ service: "events", operation: "subscribe" });

/** The input of `events.subscribe`. */
export interface SubscribeInput {
  /** The topics: from 1 to 64 names of 1 to 256 characters. */
  readonly topics: readonly string[];
}

/**
 * An item of the stream of `events.subscribe`. The first item is `subscribed`. Each other item is
 * an `event`. A subscriber ignores an item of another type: it comes from a newer publisher.
 */
export type EventItem =
  | { readonly type: "subscribed"; readonly topics: readonly string[] }
  | {
      readonly type: "event";
      readonly topic: string;
      readonly data: unknown;
      /** The number of the event in its subscription, from 1. A gap shows lost events. */
      readonly seq: number;
      /** The number of events that the publisher dropped immediately before this one. */
      readonly dropped?: number | undefined;
    };

/** One event that a subscriber gets. */
export interface RemoteEvent<T = unknown> {
  /** The topic (the channel of the bus of the publisher). */
  readonly topic: string;
  /** The data of the event, after a trip as JSON. */
  readonly data: T;
  /**
   * The number of the event for this subscriber, from 1. A resubscribe starts again at 1. A
   * subscriber that joins a shared subscription also starts at 1.
   */
  readonly seq: number;
  /** The number of events that this subscriber lost immediately before this one: 0 without a loss. */
  readonly dropped: number;
  /** The id of the subscription. It stays the same after a resubscribe. */
  readonly subscription: string;
}

/**
 * The handler of the events of a subscription. When it gives a promise, the subscriber waits for
 * it before the next event. A slow handler holds the credit of its subscription only when no
 * other subscriber of its shared subscription waits.
 */
export type RemoteEventHandler<T = unknown> = (data: T, event: RemoteEvent<T>) => void | Promise<void>;

/**
 * The backoff before each resubscribe try: an exponential backoff with jitter. The names are the
 * names of the `reconnect` options of `WebSocketTransport`. Each time is a `Duration`.
 */
export interface ResubscribeBackoff {
  /**
   * The delay before the first resubscribe try, for example `ms(250)`.
   * @default ms(250)
   */
  initialDelay?: Duration | undefined;
  /**
   * The longest delay before a resubscribe try.
   * @default seconds(30)
   */
  maxDelay?: Duration | undefined;
  /**
   * The factor of the delay from one try to the next.
   * @default 2
   */
  backoffMultiplier?: number | undefined;
  /**
   * The random part of each delay, from 0 to 1. With 1 (full jitter), the delay is a random time
   * from 0 to the backoff. 0 gives the backoff exactly.
   * @default 1
   */
  jitter?: number | undefined;
}

/** The options of a subscription. */
export interface RemoteEventsOptions {
  /** When this signal aborts, the subscription ends: the transport sends a cancel. */
  signal?: AbortSignal | undefined;
  /**
   * True: the subscriber sends the call again after a failure that a retry can repair. False: such
   * a failure ends the subscription.
   * @default true
   */
  resubscribe?: boolean | undefined;
  /**
   * The number of resubscribe tries after a failure, one after the other without a confirmation.
   * Each confirmation starts the count again. When the tries run out, the subscription ends with a
   * `SubscriptionError` that has the code of the last failure. 0 is the same as `resubscribe: false`.
   * The WebSocket transport uses the `reconnect.maxAttempts` of its options (default `Infinity`).
   * @default 10 (with the default backoff, at most approximately two minutes of waits)
   */
  maxAttempts?: number | undefined;
  /**
   * The backoff before each resubscribe try. A plain number or a function throws a `TypeError`.
   * The WebSocket transport uses its reconnect backoff when the options give none.
   * @default { initialDelay: ms(250), maxDelay: seconds(30), backoffMultiplier: 2, jitter: 1 }
   */
  backoff?: ResubscribeBackoff | undefined;
  /**
   * The clock of the backoff. A test gives the `fakeClock` of `@mark1russell7/service/testing`.
   * The default is the clock of the platform. The WebSocket transport uses its own clock.
   */
  clock?: Clock | undefined;
  /** This function gets the topics of each confirmation: the first one, and one after each resubscribe. */
  onSubscribed?: ((topics: readonly string[]) => void) | undefined;
  /** The metadata of the call, for example a trace. */
  metadata?: Record<string, unknown> | undefined;
}

/** The options of `subscribeRemote()`. */
export interface SubscribeOptions extends RemoteEventsOptions {
  /**
   * This function gets the error that ends the subscription: a refusal (`TOPIC_NOT_FOUND`,
   * `FORBIDDEN`), an older publisher (`NOT_FOUND`), a topic that the host cleared
   * (`TOPIC_CLEARED`), a transport that closed, or the last failure after `maxAttempts` tries. An
   * unsubscribe is not an error.
   */
  onError?: ((error: SubscriptionError) => void) | undefined;
}

/**
 * The unsubscribe function of a subscription. A second call does nothing. `ready` resolves at the
 * first confirmation of the publisher. It rejects when the subscription ends before it.
 */
export interface Subscription {
  (): void;
  /** This promise resolves when the publisher confirms the subscription the first time. */
  readonly ready: Promise<void>;
  /** The id of the subscription: the `subscription` of its events. */
  readonly id: string;
}

/** The error that ends a subscription. */
export class SubscriptionError extends Error {
  override readonly name = "SubscriptionError";

  constructor(
    /** The code: a code of the protocol, for example `TOPIC_NOT_FOUND`. */
    readonly code: string,
    message: string,
    /** True when a resubscribe can repair the failure. */
    readonly retryable: boolean,
    /** The reason of a `FORBIDDEN` error, for example `topic-not-allowed`. */
    readonly reason?: string | undefined,
  ) {
    super(message);
  }
}

/**
 * The parts that a transport adds to its subscriptions. The WebSocket transport waits for its
 * connection, uses its reconnect backoff, its `maxAttempts` and its clock, ends its subscriptions
 * at `close()`, and gives each event to its `onEvent` option. A shared subscription uses the
 * hooks of its first subscriber.
 */
export interface SubscriptionHooks {
  /** When this signal aborts, each subscription ends without an error. */
  readonly lifetime?: AbortSignal | undefined;
  /**
   * This function resolves when the transport can send the call. It rejects when the transport
   * closed. After a lost connection, the subscriber waits for it, not for a backoff.
   */
  readonly ready?: ((signal: AbortSignal) => Promise<void>) | undefined;
  /** The backoff in milliseconds before resubscribe try `attempt` (from 1), when the options give none. */
  readonly backoff?: ((attempt: number) => number) | undefined;
  /** The number of resubscribe tries, when the options give none. */
  readonly maxAttempts?: number | undefined;
  /** The clock of the backoff, when the options give none. */
  readonly clock?: Clock | undefined;
  /** This function gets each event of each subscription. */
  readonly onEvent?: ((event: RemoteEvent) => void) | undefined;
  /** False: no resubscribe, whatever the options say (a server cannot reach a closed connection). */
  readonly resubscribe?: boolean | undefined;
}

/** The part of a transport that a subscription uses. */
export type EventTransport = Pick<Transport, "send">;

/** The codes after which a resubscribe can succeed, also when the item does not say retryable. */
const RESUBSCRIBE_CODES: ReadonlySet<string> = new Set(["UNAVAILABLE", "TIMEOUT", "CONNECTION_CLOSED", "ABORTED"]);

/** The default number of resubscribe tries (EVENTS.md). */
const DEFAULT_MAX_ATTEMPTS = 10;

/** The default backoff, in milliseconds: from 250 ms, twice as long at each try, at most 30 s, with full jitter. */
const DEFAULT_BACKOFF = { initialDelayMs: 250, maxDelayMs: 30_000, backoffMultiplier: 2, jitter: 1 } as const;

/**
 * The number of events that the queue of one subscriber holds when another subscriber of its
 * shared subscription reads faster. When it is full, the oldest event goes, as at the publisher.
 */
const SUBSCRIBER_BUFFER = 1024;

/** The default backoff of `DEFAULT_BACKOFF`. */
function defaultBackoff(attempt: number): number {
  return exponentialBackoff([DEFAULT_BACKOFF.initialDelayMs, DEFAULT_BACKOFF.maxDelayMs, DEFAULT_BACKOFF.backoffMultiplier, DEFAULT_BACKOFF.jitter], attempt);
}

/** The delay before try `attempt`: an exponential backoff of `[base, cap, factor, jitter]`. */
function exponentialBackoff([base, cap, factor, jitter]: readonly [number, number, number, number], attempt: number): number {
  return backoffDelay({ base, factor, cap, jitter: { kind: "subtract", fraction: jitter } }, attempt);
}

let subscriptions = 0;

/** The topics of a subscription as a list. */
function topicList(topics: string | readonly string[]): readonly string[] {
  return typeof topics === "string" ? [topics] : [...topics];
}

/** A signal that aborts when one of the signals aborts, and a function that removes its listeners. */
function linkSignals(signals: ReadonlyArray<AbortSignal | undefined>): { signal: AbortSignal; unlink: () => void } {
  const controller = new AbortController();
  const present = signals.filter((signal): signal is AbortSignal => signal !== undefined);
  const abort = (): void => controller.abort();
  if (present.some((signal) => signal.aborted)) controller.abort();
  else for (const signal of present) signal.addEventListener("abort", abort, { once: true });
  return {
    signal: controller.signal,
    unlink: () => {
      for (const signal of present) signal.removeEventListener("abort", abort);
    },
  };
}

/** This function waits for a time on the clock, or until the signal aborts. */
function pause(ms: number, signal: AbortSignal, clock: Clock): Promise<void> {
  if (signal.aborted || !(ms > 0)) return Promise.resolve();
  return new Promise((resolve) => {
    let cancel: (() => void) | undefined;
    const done = (): void => {
      cancel?.();
      signal.removeEventListener("abort", done);
      resolve();
    };
    cancel = clock.after(ms, done);
    signal.addEventListener("abort", done, { once: true });
  });
}

/** The error of an error item of the call. */
function errorOfItem(item: ResponseItem<unknown>): SubscriptionError {
  const status = item.status;
  if (status.type !== "error") return new SubscriptionError("INTERNAL_ERROR", "The item is not an error", false);
  const code = String(status.code);
  const reason = item.metadata?.["reason"];
  return new SubscriptionError(code, status.message, status.retryable === true || RESUBSCRIBE_CODES.has(code), typeof reason === "string" ? reason : undefined);
}

/** The error of a call that failed in the transport: the connection closed. A resubscribe can repair it. */
function errorOfFailure(error: unknown): SubscriptionError {
  if (error instanceof SubscriptionError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new SubscriptionError("CONNECTION_CLOSED", message, true);
}

/** The error that ends a subscription when its resubscribe tries ran out. It keeps the code of the last failure. */
function exhaustedError(last: SubscriptionError, tries: number): SubscriptionError {
  return new SubscriptionError(
    last.code,
    `The subscription stopped after ${tries} resubscribe tries without a confirmation: ${last.message}`,
    last.retryable,
    last.reason,
  );
}

// =============================================================================
// The resubscribe rules
// =============================================================================

/** The resubscribe rules of a subscription, from its options and the hooks of its transport. */
interface ResubscribePolicy {
  readonly resubscribe: boolean;
  readonly maxAttempts: number;
  /** The delay in milliseconds before try `attempt` (from 1). */
  readonly backoff: (attempt: number) => number;
  readonly clock: Clock;
  /** The part of the key of a shared subscription that these rules give. */
  readonly key: unknown;
}

/** The ids of the clocks of the options, for the keys of the shared subscriptions. */
const clockIds = new WeakMap<Clock, number>();
let clocks = 0;

/** The id of the clock of the options: 0 without one. */
function clockIdOf(clock: Clock | undefined): number {
  if (!clock) return 0;
  let id = clockIds.get(clock);
  if (id === undefined) {
    id = ++clocks;
    clockIds.set(clock, id);
  }
  return id;
}

/** The milliseconds of a backoff of the options. A plain number or a function throws a `TypeError`. */
function backoffSettings(backoff: ResubscribeBackoff): [number, number, number, number] {
  if (backoff === null || typeof backoff !== "object") {
    const given = typeof backoff === "function" ? "a function" : JSON.stringify(backoff);
    throw new TypeError(
      `backoff must be an object of durations such as { initialDelay: ms(250), maxDelay: seconds(30) }, got ${given}. The backoff is no longer a function of milliseconds (EVENTS.md).`,
    );
  }
  const base = backoff.initialDelay === undefined ? DEFAULT_BACKOFF.initialDelayMs : toMs(backoff.initialDelay, "backoff.initialDelay");
  const cap = backoff.maxDelay === undefined ? DEFAULT_BACKOFF.maxDelayMs : toMs(backoff.maxDelay, "backoff.maxDelay");
  const factor = backoff.backoffMultiplier ?? DEFAULT_BACKOFF.backoffMultiplier;
  const jitter = Math.min(1, Math.max(0, backoff.jitter ?? DEFAULT_BACKOFF.jitter));
  return [base, cap, factor, jitter];
}

/** The resubscribe rules of the options and the hooks. A bad option throws a `TypeError` at once. */
function policyOf(options: RemoteEventsOptions, hooks: SubscriptionHooks): ResubscribePolicy {
  const maxAttempts = options.maxAttempts ?? hooks.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  if (typeof maxAttempts !== "number" || Number.isNaN(maxAttempts) || maxAttempts < 0) {
    throw new TypeError(`maxAttempts must be a number from 0 (Infinity for no limit), got ${JSON.stringify(maxAttempts)}`);
  }
  let backoff: (attempt: number) => number;
  let backoffKey: unknown;
  if (options.backoff !== undefined) {
    const settings = backoffSettings(options.backoff);
    backoff = (attempt) => exponentialBackoff(settings, attempt);
    backoffKey = settings;
  } else {
    backoff = hooks.backoff ?? defaultBackoff;
    backoffKey = "transport";
  }
  const resubscribe = hooks.resubscribe !== false && options.resubscribe !== false;
  return {
    resubscribe,
    maxAttempts,
    backoff,
    clock: options.clock ?? hooks.clock ?? realClock,
    key: [resubscribe, maxAttempts === Number.POSITIVE_INFINITY ? "Infinity" : maxAttempts, backoffKey, clockIdOf(options.clock)],
  };
}

// =============================================================================
// The wire subscription
// =============================================================================

/** An event item of the stream of `events.subscribe`. */
type WireEvent = Extract<EventItem, { type: "event" }>;

/** What the call of a wire subscription needs besides the transport. */
interface WireCall {
  readonly topics: readonly string[];
  readonly metadata: Record<string, unknown>;
  readonly policy: ResubscribePolicy;
  readonly hooks: SubscriptionHooks;
  /** The id of the subscription: the prefix of the id of each call. */
  readonly id: string;
  /** This function gets the topics of each `subscribed` item. */
  readonly onSubscribed: (topics: readonly string[]) => void;
  /** This function runs before each resubscribe try. */
  readonly onRetry: () => void;
}

/** The events of a wire subscription, with each resubscribe. The generator ends when `stop` aborts. */
async function* wireEvents(transport: EventTransport, call: WireCall, stop: AbortSignal): AsyncGenerator<WireEvent, void, undefined> {
  const { policy, hooks } = call;
  const { signal, unlink } = linkSignals([stop, hooks.lifetime]);
  let attempt = 0;
  let tries = 0;
  try {
    for (;;) {
      if (signal.aborted) return;
      if (hooks.ready) {
        await hooks.ready(signal);
        if (signal.aborted) return;
      }
      const message: Message<SubscribeInput> = {
        id: `${call.id}.${++tries}`,
        method: SUBSCRIBE_METHOD,
        payload: { topics: [...call.topics] },
        metadata: { ...call.metadata },
        signal,
      };
      let failure: { error: SubscriptionError; lost: boolean } | undefined;
      try {
        for await (const item of transport.send<SubscribeInput, EventItem>(message)) {
          if (item.status.type === "error") {
            failure = { error: errorOfItem(item), lost: false };
            break;
          }
          const payload = item.payload as EventItem | undefined;
          if (payload === null || typeof payload !== "object") continue;
          if (payload.type === "subscribed") {
            attempt = 0;
            call.onSubscribed(payload.topics);
          } else if (payload.type === "event") {
            yield payload;
          }
        }
      } catch (error) {
        failure = { error: errorOfFailure(error), lost: true };
      }
      // An unsubscribe, or the end of the transport: no error
      if (signal.aborted) return;
      // The publisher ended the subscription
      if (!failure) return;
      if (!policy.resubscribe || !failure.error.retryable || policy.maxAttempts === 0) throw failure.error;
      // The tries ran out: before, HTTP resubscribed forever
      if (attempt >= policy.maxAttempts) throw exhaustedError(failure.error, attempt);
      attempt++;
      call.onRetry();
      // After a lost connection, the transport waits for its reconnect: no second backoff
      if (!(failure.lost && hooks.ready)) await pause(policy.backoff(attempt), signal, policy.clock);
    }
  } finally {
    unlink();
  }
}

// =============================================================================
// The shared subscriptions
// =============================================================================

/** An entry of the queue of one subscriber: a confirmation, or an event with its own numbers. */
type Entry =
  | { readonly kind: "subscribed"; readonly topics: readonly string[] }
  | { readonly kind: "event"; readonly topic: string; readonly data: unknown; readonly seq: number; dropped: number };

/**
 * One subscriber of a shared subscription: its queue, and its numbers. Its `seq` counts from the
 * last event that the shared subscription got before the subscriber joined.
 */
class Subscriber {
  /** The `seq` of the wire subscription before the first event of this subscriber. */
  base = 0;
  /** The error that ends this subscriber, after the entries of its queue. */
  failure: SubscriptionError | undefined;
  /** This function tells the shared subscription that the subscriber waits. */
  onWait: () => void = () => undefined;
  private readonly queue: Entry[] = [];
  private events = 0;
  private waiter: ((entry: Entry | undefined) => void) | undefined;
  private ended = false;

  constructor(readonly id: string) {}

  /** True when the subscriber waits for an entry. */
  get waiting(): boolean {
    return this.waiter !== undefined;
  }

  /** This function gives the subscriber one event of the wire, with its own `seq`. */
  pushEvent(event: WireEvent): void {
    this.push({ kind: "event", topic: event.topic, data: event.data, seq: event.seq - this.base, dropped: event.dropped ?? 0 });
  }

  /** This function gives the subscriber one entry. A full queue drops its oldest event. */
  push(entry: Entry): void {
    if (this.ended) return;
    const waiter = this.waiter;
    if (waiter) {
      this.waiter = undefined;
      waiter(entry);
      return;
    }
    if (entry.kind === "event") {
      if (this.events >= SUBSCRIBER_BUFFER) {
        // The next event of the same wire stream tells the loss. After a confirmation, a new stream starts.
        const index = this.queue.findIndex((queued) => queued.kind === "event");
        const lost = this.queue.splice(index, 1)[0] as Extract<Entry, { kind: "event" }>;
        this.events--;
        const next = index < this.queue.length ? this.queue[index]! : entry;
        if (next.kind === "event") next.dropped += 1 + lost.dropped;
      }
      this.events++;
    }
    this.queue.push(entry);
  }

  /** The next entry, or undefined at the end. */
  take(): Promise<Entry | undefined> {
    const entry = this.queue.shift();
    if (entry) {
      if (entry.kind === "event") this.events--;
      return Promise.resolve(entry);
    }
    if (this.ended) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      this.waiter = resolve;
      this.onWait();
    });
  }

  /**
   * This function ends the subscriber. Without `discard`, it first gives the entries of its queue.
   * The shared subscription ends it with its error, and an unsubscribe ends it with `discard`.
   */
  end(failure?: SubscriptionError, discard = false): void {
    if (this.ended) return;
    this.ended = true;
    this.failure = failure;
    if (discard) {
      this.queue.length = 0;
      this.events = 0;
    }
    const waiter = this.waiter;
    this.waiter = undefined;
    waiter?.(undefined);
  }
}

/**
 * One wire subscription and its subscribers. It reads the next item of the wire only when a
 * subscriber waits, so a single slow subscriber holds the credit, as before the share. It ends
 * when its last subscriber leaves, or with the end of the wire subscription for each subscriber.
 */
class SharedSubscription {
  private readonly members = new Set<Subscriber>();
  private readonly stop = new AbortController();
  /** The topics of the current confirmation, or undefined before it and during a resubscribe. */
  private confirmed: readonly string[] | undefined;
  /** The `seq` of the last event of the wire. */
  private lastSeq = 0;
  private demand: (() => void) | undefined;
  private started = false;
  private finished = false;

  constructor(
    private readonly shares: Map<string, SharedSubscription> | undefined,
    private readonly key: string,
    private readonly transport: EventTransport,
    private readonly call: Omit<WireCall, "onSubscribed" | "onRetry">,
  ) {}

  /** True while a new subscriber can join. */
  get open(): boolean {
    return !this.finished && !this.stop.signal.aborted;
  }

  /** This function adds a subscriber. On a confirmed subscription, it gets the confirmation at once. */
  join(subscriber: Subscriber): void {
    this.members.add(subscriber);
    subscriber.base = this.lastSeq;
    subscriber.onWait = () => this.wake();
    if (this.confirmed) subscriber.push({ kind: "subscribed", topics: this.confirmed });
    if (!this.started) {
      this.started = true;
      void this.run();
    }
  }

  /** This function removes a subscriber. The last one ends the wire subscription: the transport sends the cancel. */
  leave(subscriber: Subscriber): void {
    if (!this.members.delete(subscriber) || this.members.size > 0) return;
    this.forget();
    this.stop.abort();
    this.wake();
  }

  private wake(): void {
    const demand = this.demand;
    this.demand = undefined;
    demand?.();
  }

  /** This function removes the subscription from the shares of its transport. */
  private forget(): void {
    if (this.shares?.get(this.key) === this) this.shares.delete(this.key);
  }

  private stopped(): boolean {
    return this.stop.signal.aborted || this.call.hooks.lifetime?.aborted === true;
  }

  private wanted(): boolean {
    for (const member of this.members) if (member.waiting) return true;
    return false;
  }

  private async run(): Promise<void> {
    const events = wireEvents(
      this.transport,
      {
        ...this.call,
        onSubscribed: (topics) => {
          this.confirmed = topics;
          this.lastSeq = 0;
          for (const member of this.members) {
            member.base = 0;
            member.push({ kind: "subscribed", topics });
          }
        },
        onRetry: () => {
          this.confirmed = undefined;
        },
      },
      this.stop.signal,
    );
    // The end of the transport ends the wait for a subscriber too
    const lifetime = this.call.hooks.lifetime;
    const onLifetime = (): void => this.wake();
    lifetime?.addEventListener("abort", onLifetime, { once: true });
    let failure: SubscriptionError | undefined;
    try {
      for (;;) {
        while (!this.stopped() && !this.wanted()) {
          await new Promise<void>((resolve) => {
            this.demand = resolve;
          });
        }
        if (this.stopped()) break;
        const result = await events.next();
        if (result.done) break;
        this.lastSeq = result.value.seq;
        for (const member of this.members) member.pushEvent(result.value);
      }
    } catch (error) {
      failure = errorOfFailure(error);
    } finally {
      this.finished = true;
      this.forget();
      lifetime?.removeEventListener("abort", onLifetime);
      await events.return(undefined).catch(() => undefined);
    }
    // The end of the wire subscription goes to each subscriber
    for (const member of [...this.members]) member.end(failure);
    this.members.clear();
  }
}

/** The shared subscriptions of each transport, by key. */
const sharesOf = new WeakMap<EventTransport, Map<string, SharedSubscription>>();

/** The key of a shared subscription: the set of topics, the metadata and the resubscribe rules. */
function keyOf(topics: readonly string[], metadata: Record<string, unknown>, policy: ResubscribePolicy): string | undefined {
  try {
    return JSON.stringify([[...new Set(topics)].sort(), metadata, policy.key]);
  } catch {
    // Metadata that is not JSON: the subscription is not shared
    return undefined;
  }
}

/** The shared subscription of a new subscriber: an open one with the same key, or a new one with the id of the subscriber. */
function sharedFor(
  transport: EventTransport,
  topics: readonly string[],
  options: RemoteEventsOptions,
  hooks: SubscriptionHooks,
  policy: ResubscribePolicy,
  id: string,
): SharedSubscription {
  const metadata = { ...(options.metadata ?? {}) };
  const key = keyOf(topics, metadata, policy);
  let shares = sharesOf.get(transport);
  if (!shares) {
    shares = new Map();
    sharesOf.set(transport, shares);
  }
  const existing = key === undefined ? undefined : shares.get(key);
  if (existing?.open) return existing;
  const shared = new SharedSubscription(key === undefined ? undefined : shares, key ?? "", transport, { topics, metadata, policy, hooks, id });
  if (key !== undefined) shares.set(key, shared);
  return shared;
}

/** The event that a subscriber gets from an entry of its queue. */
function remoteEventOf<T>(entry: Extract<Entry, { kind: "event" }>, id: string): RemoteEvent<T> {
  return { topic: entry.topic, data: entry.data as T, seq: entry.seq, dropped: entry.dropped, subscription: id };
}

/** This function calls `onSubscribed`. An error of it goes to `console.error`, and the subscription goes on. */
function confirmTo(options: RemoteEventsOptions, topics: readonly string[]): void {
  try {
    options.onSubscribed?.(topics);
  } catch (error) {
    console.error("[events] The onSubscribed handler failed:", error);
  }
}

/** This function joins a new subscriber to its shared subscription, and gives the function that leaves it. */
function attach(
  subscriber: Subscriber,
  transport: EventTransport,
  topics: readonly string[],
  options: RemoteEventsOptions,
  hooks: SubscriptionHooks,
  policy: ResubscribePolicy,
): () => void {
  if (options.signal?.aborted) {
    subscriber.end(undefined, true);
    return () => undefined;
  }
  const shared = sharedFor(transport, topics, options, hooks, policy, subscriber.id);
  let left = false;
  const leave = (): void => {
    if (left) return;
    left = true;
    options.signal?.removeEventListener("abort", leave);
    shared.leave(subscriber);
    subscriber.end(undefined, true);
  };
  options.signal?.addEventListener("abort", leave, { once: true });
  shared.join(subscriber);
  return leave;
}

/**
 * This function gives the events of a subscription to topics of the bus of the other side. The
 * iteration joins the subscription, so it sends the call when no subscriber shares one. A `break`
 * of the reader, or the abort of the signal, leaves it: the last subscriber sends the cancel. An
 * error that ends the subscription ends the iteration with a `SubscriptionError`.
 *
 * @param transport - The transport to the publisher: HTTP, WebSocket, a message port, local
 * @param topics - One topic, or a list of 1 to 64 topics
 * @param options - The signal, the resubscribe rules, the clock and the confirmation handler
 * @param hooks - The parts that a transport adds (its connection, its backoff, its `onEvent`)
 * @throws TypeError - When `backoff` or `maxAttempts` is not valid, for example a plain number of milliseconds
 */
export function remoteEvents<T = unknown>(
  transport: EventTransport,
  topics: string | readonly string[],
  options: RemoteEventsOptions = {},
  hooks: SubscriptionHooks = {},
): AsyncIterable<RemoteEvent<T>> {
  const list = topicList(topics);
  const policy = policyOf(options, hooks);
  return {
    [Symbol.asyncIterator]: (): AsyncIterableIterator<RemoteEvent<T>> => {
      const subscriber = new Subscriber(`events-${++subscriptions}`);
      let leave: (() => void) | undefined;
      let stopped = false;
      const stop = (): void => {
        stopped = true;
        if (leave) leave();
        else subscriber.end(undefined, true);
      };
      const iterator: AsyncIterableIterator<RemoteEvent<T>> = {
        async next(): Promise<IteratorResult<RemoteEvent<T>>> {
          if (!leave && !stopped) leave = attach(subscriber, transport, list, options, hooks, policy);
          for (;;) {
            const entry = await subscriber.take();
            if (!entry) {
              const failure = subscriber.failure;
              subscriber.failure = undefined;
              stop();
              if (failure) throw failure;
              return { value: undefined, done: true };
            }
            if (entry.kind === "subscribed") {
              confirmTo(options, entry.topics);
              continue;
            }
            const event = remoteEventOf<T>(entry, subscriber.id);
            hooks.onEvent?.(event as RemoteEvent);
            return { value: event, done: false };
          }
        },
        async return(): Promise<IteratorResult<RemoteEvent<T>>> {
          stop();
          return { value: undefined, done: true };
        },
        async throw(error?: unknown): Promise<IteratorResult<RemoteEvent<T>>> {
          stop();
          throw error;
        },
        [Symbol.asyncIterator]() {
          return iterator;
        },
      };
      return iterator;
    },
  };
}

/**
 * This function subscribes to topics of the bus of the other side, and calls the handler for each
 * event in order. It gives the unsubscribe function, with the `ready` promise of the first
 * confirmation. An error of the handler goes to `console.error`, and the subscription goes on.
 * The subscribers of the same topics with the same options on one transport share one call.
 *
 * @param transport - The transport to the publisher
 * @param topics - One topic, or a list of 1 to 64 topics
 * @param handler - The handler of each event: it gets the data and the event
 * @param options - The options of `remoteEvents()`, and the `onError` handler of the end
 * @param hooks - The parts that a transport adds
 * @throws TypeError - When `backoff` or `maxAttempts` is not valid, for example a plain number of milliseconds
 */
export function subscribeRemote<T = unknown>(
  transport: EventTransport,
  topics: string | readonly string[],
  handler: RemoteEventHandler<T>,
  options: SubscribeOptions = {},
  hooks: SubscriptionHooks = {},
): Subscription {
  const list = topicList(topics);
  const policy = policyOf(options, hooks);
  const subscriber = new Subscriber(`events-${++subscriptions}`);
  let confirmed = false;
  let confirm: () => void = () => undefined;
  let refuse: (error: SubscriptionError) => void = () => undefined;
  const ready = new Promise<void>((resolve, reject) => {
    confirm = resolve;
    refuse = reject;
  });
  // A caller that does not wait for `ready` gets no unhandled rejection
  ready.catch(() => undefined);
  const leave = attach(subscriber, transport, list, options, hooks, policy);

  void (async () => {
    try {
      for (;;) {
        const entry = await subscriber.take();
        if (!entry) break;
        if (entry.kind === "subscribed") {
          if (!confirmed) {
            confirmed = true;
            confirm();
          }
          confirmTo(options, entry.topics);
          continue;
        }
        const event = remoteEventOf<T>(entry, subscriber.id);
        hooks.onEvent?.(event as RemoteEvent);
        try {
          await handler(event.data, event);
        } catch (error) {
          console.error(`[events] The handler of ${event.topic} failed:`, error);
        }
      }
    } finally {
      leave();
    }
    const failure = subscriber.failure;
    if (!confirmed) refuse(failure ?? new SubscriptionError("ABORTED", "The subscription ended before its confirmation", false));
    if (failure) options.onError?.(failure);
  })();

  return Object.assign(leave, { ready, id: subscriber.id });
}
