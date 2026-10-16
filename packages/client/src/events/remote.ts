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
 * After a failure that a retry can repair (a closed connection, `UNAVAILABLE`, `TIMEOUT`), the
 * subscriber sends the call again after a backoff. The delivery is at most once: the events
 * between the failure and the new confirmation are lost. Each other error ends the subscription.
 *
 * This file imports only types and the backoff, so a page or a worker that subscribes stays small.
 */

import type { Message, Method, ResponseItem, Transport } from "../client/types.js";
import { backoffDelay } from "@mark1russell7/service/backoff";

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
  /** The number of the event in its subscription, from 1. A resubscribe starts again at 1. */
  readonly seq: number;
  /** The number of events that the publisher dropped immediately before this one: 0 without a loss. */
  readonly dropped: number;
  /** The id of the subscription. It stays the same after a resubscribe. */
  readonly subscription: string;
}

/**
 * The handler of the events of a subscription. When it gives a promise, the subscriber waits for
 * it before the next event, so a slow handler holds the credit of its own subscription only.
 */
export type RemoteEventHandler<T = unknown> = (data: T, event: RemoteEvent<T>) => void | Promise<void>;

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
   * This function gives the time before resubscribe try `attempt` (from 1), in milliseconds. The
   * default is an exponential backoff from 250 ms to 30 s with full jitter. The WebSocket
   * transport uses its reconnect backoff.
   */
  backoff?: ((attempt: number) => number) | undefined;
  /** This function gets the topics of each confirmation: the first one, and one after each resubscribe. */
  onSubscribed?: ((topics: readonly string[]) => void) | undefined;
  /** The metadata of the call, for example a trace. */
  metadata?: Record<string, unknown> | undefined;
}

/** The options of `subscribeRemote()`. */
export interface SubscribeOptions extends RemoteEventsOptions {
  /**
   * This function gets the error that ends the subscription: a refusal (`TOPIC_NOT_FOUND`,
   * `FORBIDDEN`), an older publisher (`NOT_FOUND`), or a transport that closed. An unsubscribe is
   * not an error.
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
 * connection, uses its reconnect backoff, ends its subscriptions at `close()`, and gives each
 * event to its `onEvent` option.
 */
export interface SubscriptionHooks {
  /** When this signal aborts, each subscription ends without an error. */
  readonly lifetime?: AbortSignal | undefined;
  /**
   * This function resolves when the transport can send the call. It rejects when the transport
   * closed. After a lost connection, the subscriber waits for it, not for a backoff.
   */
  readonly ready?: ((signal: AbortSignal) => Promise<void>) | undefined;
  /** The backoff, when the options give none. */
  readonly backoff?: ((attempt: number) => number) | undefined;
  /** This function gets each event of each subscription. */
  readonly onEvent?: ((event: RemoteEvent) => void) | undefined;
  /** False: no resubscribe, whatever the options say (a server cannot reach a closed connection). */
  readonly resubscribe?: boolean | undefined;
}

/** The part of a transport that a subscription uses. */
export type EventTransport = Pick<Transport, "send">;

/** The codes after which a resubscribe can succeed, also when the item does not say retryable. */
const RESUBSCRIBE_CODES: ReadonlySet<string> = new Set(["UNAVAILABLE", "TIMEOUT", "CONNECTION_CLOSED", "ABORTED"]);

/** The default backoff: from 250 ms, twice as long at each try, at most 30 s, with full jitter. */
function defaultBackoff(attempt: number): number {
  return backoffDelay({ base: 250, factor: 2, cap: 30_000, jitter: { kind: "subtract", fraction: 1 } }, attempt);
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

/** This function waits for a time, or until the signal aborts. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted || !(ms > 0)) return Promise.resolve();
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
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

/** The events of a subscription, with each resubscribe. The generator ends at the unsubscribe. */
async function* eventsOf<T>(
  transport: EventTransport,
  topics: readonly string[],
  options: RemoteEventsOptions,
  hooks: SubscriptionHooks,
  id: string,
): AsyncGenerator<RemoteEvent<T>, void, undefined> {
  const { signal, unlink } = linkSignals([options.signal, hooks.lifetime]);
  const resubscribe = hooks.resubscribe !== false && options.resubscribe !== false;
  const backoff = options.backoff ?? hooks.backoff ?? defaultBackoff;
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
        id: `${id}.${++tries}`,
        method: SUBSCRIBE_METHOD,
        payload: { topics: [...topics] },
        metadata: { ...(options.metadata ?? {}) },
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
            options.onSubscribed?.(payload.topics);
          } else if (payload.type === "event") {
            const event: RemoteEvent<T> = {
              topic: payload.topic,
              data: payload.data as T,
              seq: payload.seq,
              dropped: payload.dropped ?? 0,
              subscription: id,
            };
            hooks.onEvent?.(event as RemoteEvent);
            yield event;
          }
        }
      } catch (error) {
        failure = { error: errorOfFailure(error), lost: true };
      }
      // An unsubscribe, or the end of the transport: no error
      if (signal.aborted) return;
      // The publisher ended the subscription
      if (!failure) return;
      if (!resubscribe || !failure.error.retryable) throw failure.error;
      attempt++;
      // After a lost connection, the transport waits for its reconnect: no second backoff
      if (!(failure.lost && hooks.ready)) await pause(backoff(attempt), signal);
    }
  } finally {
    unlink();
  }
}

/**
 * This function gives the events of a subscription to topics of the bus of the other side. The
 * iteration sends the call. A `break` of the reader, or the abort of the signal, sends the cancel.
 * An error that ends the subscription ends the iteration with a `SubscriptionError`.
 *
 * @param transport - The transport to the publisher: HTTP, WebSocket, a message port, local
 * @param topics - One topic, or a list of 1 to 64 topics
 * @param options - The signal, the resubscribe, the backoff and the confirmation handler
 * @param hooks - The parts that a transport adds (its connection, its backoff, its `onEvent`)
 */
export function remoteEvents<T = unknown>(
  transport: EventTransport,
  topics: string | readonly string[],
  options: RemoteEventsOptions = {},
  hooks: SubscriptionHooks = {},
): AsyncIterable<RemoteEvent<T>> {
  const list = topicList(topics);
  return {
    [Symbol.asyncIterator]: () => eventsOf<T>(transport, list, options, hooks, `events-${++subscriptions}`),
  };
}

/**
 * This function subscribes to topics of the bus of the other side, and calls the handler for each
 * event in order. It gives the unsubscribe function, with the `ready` promise of the first
 * confirmation. An error of the handler goes to `console.error`, and the subscription goes on.
 *
 * @param transport - The transport to the publisher
 * @param topics - One topic, or a list of 1 to 64 topics
 * @param handler - The handler of each event: it gets the data and the event
 * @param options - The options of `remoteEvents()`, and the `onError` handler of the end
 * @param hooks - The parts that a transport adds
 */
export function subscribeRemote<T = unknown>(
  transport: EventTransport,
  topics: string | readonly string[],
  handler: RemoteEventHandler<T>,
  options: SubscribeOptions = {},
  hooks: SubscriptionHooks = {},
): Subscription {
  const controller = new AbortController();
  const id = `events-${++subscriptions}`;
  let confirmed = false;
  let confirm: () => void = () => undefined;
  let refuse: (error: SubscriptionError) => void = () => undefined;
  const ready = new Promise<void>((resolve, reject) => {
    confirm = resolve;
    refuse = reject;
  });
  // A caller that does not wait for `ready` gets no unhandled rejection
  ready.catch(() => undefined);
  const { signal, unlink } = linkSignals([options.signal, controller.signal]);
  const settings: RemoteEventsOptions = {
    ...options,
    signal,
    onSubscribed: (list) => {
      if (!confirmed) {
        confirmed = true;
        confirm();
      }
      options.onSubscribed?.(list);
    },
  };

  void (async () => {
    try {
      for await (const event of { [Symbol.asyncIterator]: () => eventsOf<T>(transport, topicList(topics), settings, hooks, id) }) {
        try {
          await handler(event.data, event);
        } catch (error) {
          console.error(`[events] The handler of ${event.topic} failed:`, error);
        }
      }
      if (!confirmed) refuse(new SubscriptionError("ABORTED", "The subscription ended before its confirmation", false));
    } catch (error) {
      const failure = errorOfFailure(error);
      if (!confirmed) refuse(failure);
      options.onError?.(failure);
    } finally {
      unlink();
    }
  })();

  const unsubscribe = (): void => controller.abort();
  return Object.assign(unsubscribe, { ready, id });
}
