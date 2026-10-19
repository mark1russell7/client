/**
 * The push feed of the remote changes of a `HybridStorage` (roadmap CLI-21, CLI-15).
 *
 * A `RemoteChangeFeed` pushes the deltas of the remote. When the `since` of a delta is the cursor
 * of the storage, the storage applies the delta without a read. A gap, a lost event or a new
 * subscription makes the storage read the changes since its cursor. Thus the feed replaces most
 * of the periodic pulls, and the pulls stay correct when the feed loses an event.
 *
 * `EventsChangeFeed` is the feed of the change events of the core collection procedures: the topic
 * `collections.<name>` of `events.subscribe` (`documentation/EVENTS.md`). By default, an event has
 * only the ids and the versions: the feed gives it as a hint, and the storage reads the values
 * with a pull, through the checks of a read. The file imports no module of Node, so it runs in a
 * browser.
 */

import type { StorageChanges } from "@procedures/collections";
import {
  collectionChangeTopic,
  subscribeRemote,
  type RemoteEvent,
  type SubscribeOptions,
  type Subscription,
  type SubscriptionError,
} from "@procedures/client/browser";
import type { EventTransport } from "@procedures/client/events";

/**
 * A delta of the remote that a feed pushes: the changes between two versions of the remote. The
 * changes have the form of `getChangesSince()`.
 */
export interface RemoteChanges<T> extends StorageChanges<T> {
  /**
   * The version of the remote before the changes. A storage applies the delta without a read only
   * when this version is its cursor. Without it, the storage reads the changes.
   */
  readonly since?: string | undefined;
  /** The origin of the writes of the delta, when one origin made all of them. */
  readonly origin?: string | undefined;
}

/**
 * A hint of the remote (roadmap CLI-15): the ids that changed between two versions, without their
 * values. A value reaches a subscriber only through a read, with the checks of a read.
 */
export interface RemoteChangeHint {
  /** The version of the remote before the changes, or undefined when the chain of versions starts. */
  readonly since?: string | undefined;
  /** The version of the remote after the changes, or undefined for a remote without a change log. */
  readonly version?: string | undefined;
  /** The ids of the items that changed: the listener reads their values. */
  readonly changed: readonly string[];
  /** The ids that were deleted. A delete needs no value. */
  readonly deleted: readonly string[];
  /** The origin of the writes, when one origin made all of them. */
  readonly origin?: string | undefined;
}

/** The functions that get the pushes of a feed. */
export interface RemoteChangeListener<T> {
  /** This function gets a delta of the remote with its values. The listener applies it, or reads the changes. */
  onChanges(changes: RemoteChanges<T>): void;
  /**
   * This function gets a hint without values. The listener reads the changes, or applies the
   * deletes when no value changed. Without it, a hint goes to `onGap()`.
   */
  onHint?(hint: RemoteChangeHint): void;
  /**
   * This function tells that the feed can have lost changes: a gap of the events, a lost event, or
   * a new subscription. The listener reads the changes since its cursor.
   */
  onGap(): void;
  /** This function gets the error that stops the feed. The listener then reads the changes only with its pulls. */
  onError?(error: unknown): void;
}

/** A push feed of the changes of a remote storage (roadmap CLI-21). */
export interface RemoteChangeFeed<T> {
  /**
   * This method starts to push the changes to a listener. Each new subscription calls `onGap()`
   * when it starts, so the listener reads the changes that came before it.
   *
   * @returns The function that stops the pushes. A second use of it does nothing.
   */
  subscribe(listener: RemoteChangeListener<T>): () => void;
}

/**
 * An object that subscribes to the topics of the event bus of a server: a `Client`, or a
 * `WebSocketTransport` of `@procedures/client`.
 */
export interface EventSubscriber {
  subscribe<E = unknown>(
    topics: string | readonly string[],
    handler: (data: E, event: RemoteEvent<E>) => void | Promise<void>,
    options?: SubscribeOptions,
  ): Subscription;
}

/** The source of the events of an `EventsChangeFeed`: an `EventSubscriber`, or a transport. */
export type ChangeEventSource = EventSubscriber | EventTransport;

/** The options of an `EventsChangeFeed`. */
export interface EventsChangeFeedOptions {
  /** The collection of the core collection procedures. The topic is `collections.<collection>`. */
  collection?: string | undefined;
  /** The topic of the change events, for example with a partition. It comes before `collection`. */
  topic?: string | undefined;
  /**
   * The options of the subscription: the resubscribe rules, the backoff, the clock and the
   * metadata of the call. The feed gives `onSubscribed` and `onError` itself.
   * @default `{ maxAttempts: Infinity }`: the feed resubscribes until it stops
   */
  subscription?: Omit<SubscribeOptions, "onSubscribed" | "onError"> | undefined;
  /** This function gets the error that ends the subscription, for example `TOPIC_NOT_FOUND`. */
  onError?: ((error: SubscriptionError) => void) | undefined;
}

/** True for a source with `subscribe()`: it subscribes itself. */
function isSubscriber(source: ChangeEventSource): source is EventSubscriber {
  return typeof (source as Partial<EventSubscriber>).subscribe === "function";
}

/** True for a string, or for no value. */
const optionalString = (value: unknown): value is string | undefined => value === undefined || typeof value === "string";

/** True for a list of ids. */
const isIds = (value: unknown): value is string[] => Array.isArray(value) && value.every((id) => typeof id === "string");

/**
 * The delta or the hint of a change event of the collection procedures, or undefined for an
 * event of another form. The event comes over the wire: the function examines each field.
 *
 * - An event with `since`, `version` and a value for each changed id is a delta: `changes`.
 * - Each other event is a hint: an event without values, an event with withheld values (the
 *   filter of the host refused them), or a hint of a storage without a change log.
 */
function eventOf<T>(data: unknown): { readonly changes: RemoteChanges<T> } | { readonly hint: RemoteChangeHint } | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const event = data as { since?: unknown; version?: unknown; changed?: unknown; deleted?: unknown; values?: unknown; withheld?: unknown; origin?: unknown };
  const { since, version, origin } = event;
  if (!optionalString(since) || !optionalString(version) || !optionalString(origin)) return undefined;
  if (!isIds(event.changed) || !isIds(event.deleted) || (event.withheld !== undefined && !isIds(event.withheld))) return undefined;
  let values: Array<[string, T]> | undefined;
  if (event.values !== undefined) {
    if (!Array.isArray(event.values)) return undefined;
    values = [];
    for (const value of event.values as unknown[]) {
      const entry = value as { id?: unknown; value?: unknown } | null;
      if (typeof entry !== "object" || entry === null || typeof entry.id !== "string" || !("value" in entry)) return undefined;
      values.push([entry.id, entry.value as T]);
    }
  }
  const withOrigin = origin !== undefined ? { origin } : {};
  const valued = new Set(values?.map(([id]) => id));
  const withheld = (event.withheld as string[] | undefined) ?? [];
  const complete = values !== undefined && withheld.length === 0 && (event.changed as string[]).every((id) => valued.has(id));
  if (since !== undefined && version !== undefined && complete) {
    return { changes: { since, version, full: false, changed: values!, deleted: event.deleted as string[], ...withOrigin } };
  }
  return {
    hint: {
      ...(since !== undefined && { since }),
      ...(version !== undefined && { version }),
      changed: event.changed as string[],
      deleted: event.deleted as string[],
      ...withOrigin,
    },
  };
}

/**
 * The push feed of the change events of the core collection procedures (roadmap CLI-15). It
 * subscribes to the topic `collections.<name>` with `events.subscribe`. The delivery of the events
 * is at most once, so the feed treats them as hints:
 *
 * - An event without values (the default of the procedures) or with withheld values goes to
 *   `onHint()`. The storage reads the values with a pull, so each value passes the checks of a
 *   read. A hint with only deletes applies without a pull when `since` is the cursor.
 * - An event with the values of each changed id (the option `values` of the procedures) goes to
 *   `onChanges()`. The storage applies it without a read when `since` is its cursor.
 * - A gap of the numbers of the events, a lost event (`dropped`), an event of another form, and
 *   each confirmation of the subscription (the first one and each resubscribe) call `onGap()`.
 * - The error that ends the subscription goes to `onError` of the options and of the listener.
 *
 * @example
 * ```typescript
 * const users = new HybridStorage(new ApiStorage(client, { collection: "users" }), {
 *   versionOf: (user) => user.rev,
 *   feed: new EventsChangeFeed(client, { collection: "users" }),
 * });
 * ```
 */
export class EventsChangeFeed<T> implements RemoteChangeFeed<T> {
  /** The topic of the change events. */
  readonly topic: string;
  private readonly source: ChangeEventSource;
  private readonly subscription: Omit<SubscribeOptions, "onSubscribed" | "onError">;
  private readonly onError: ((error: SubscriptionError) => void) | undefined;

  /**
   * @param source - A `Client` or a `WebSocketTransport`, or another transport of the client
   * @param options - The collection or the topic, and the options of the subscription
   */
  constructor(source: ChangeEventSource, options: EventsChangeFeedOptions) {
    const topic = options.topic ?? (options.collection !== undefined ? collectionChangeTopic(options.collection) : undefined);
    if (topic === undefined || topic === "") throw new TypeError("EventsChangeFeed needs a collection or a topic");
    this.topic = topic;
    this.source = source;
    this.subscription = { maxAttempts: Number.POSITIVE_INFINITY, ...options.subscription };
    this.onError = options.onError;
  }

  subscribe(listener: RemoteChangeListener<T>): () => void {
    /** The number of the next event: a resubscribe starts again at 1 */
    let next = 1;
    let stopped = false;
    const handler = (data: unknown, event: RemoteEvent<unknown>): void => {
      if (stopped) return;
      const lost = event.dropped > 0 || event.seq !== next;
      next = event.seq + 1;
      if (lost) listener.onGap();
      const parsed = eventOf<T>(data);
      if (parsed === undefined) listener.onGap();
      else if ("changes" in parsed) listener.onChanges(parsed.changes);
      // A hint: the listener reads the values with a read of its own
      else if (listener.onHint) listener.onHint(parsed.hint);
      else listener.onGap();
    };
    const options: SubscribeOptions = {
      ...this.subscription,
      onSubscribed: () => {
        if (stopped) return;
        next = 1;
        listener.onGap();
      },
      onError: (error) => {
        if (stopped) return;
        this.onError?.(error);
        listener.onError?.(error);
      },
    };
    const unsubscribe = isSubscriber(this.source)
      ? this.source.subscribe<unknown>(this.topic, handler, options)
      : subscribeRemote<unknown>(this.source, this.topic, handler, options);
    return () => {
      if (stopped) return;
      stopped = true;
      unsubscribe();
    };
  }
}
