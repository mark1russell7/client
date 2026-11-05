/**
 * The reader of a live topic (documentation/LIVE-STATE-2026-11.md).
 *
 * The view subscribes first and reads the snapshot second. It applies the snapshot, then the events
 * that came during the read, in their order. So no number is necessary: each set publishes an
 * event, and the last event of a key decides. After a lost connection and after a loss of events,
 * the view reads the snapshot again and replaces its values.
 */
import { pathToMethod } from "../server/method.js";
import type { Method } from "../client/types.js";
import { LIVE_SNAPSHOT_PATH, type LiveEntry, type LiveEvent } from "./live-state.js";
import type { RemoteEventHandler, SubscribeOptions, Subscription } from "./remote.js";

/** The parts of a client that a view uses. A `Client` has them. */
export interface LiveClient {
  /** This method starts a subscription. */
  subscribe<T = unknown>(topics: string | readonly string[], handler: RemoteEventHandler<T>, options?: SubscribeOptions): Subscription;
  /** This method calls a procedure. */
  call<TReq, TRes>(method: Method, payload: TReq): Promise<TRes>;
}

/** The options of a view. */
export interface LiveViewOptions<T = unknown> extends SubscribeOptions {
  /** This function gets the values after each change. */
  onChange?: ((values: ReadonlyMap<string, LiveEntry<T>>) => void) | undefined;
  /** This function gets the error of a read of the snapshot. The view keeps its values and its subscription. */
  onReadError?: ((error: unknown) => void) | undefined;
}

/** The live values of a topic for one reader. */
export interface LiveView<T = unknown> {
  /** The live values by key. */
  readonly values: ReadonlyMap<string, LiveEntry<T>>;
  /** This promise resolves after the first snapshot. It rejects when the first subscription or read fails. */
  readonly ready: Promise<void>;
  /** This method ends the subscription. A second call does nothing. */
  close(): void;
}

/**
 * This function gives a view of a live topic.
 *
 * @example
 * ```typescript
 * const view = liveView(client, liveTopic("presence", "board-1"), { onChange: render });
 * await view.ready;
 * view.close();
 * ```
 */
export function liveView<T = unknown>(client: LiveClient, topic: string, options: LiveViewOptions<T> = {}): LiveView<T> {
  const { onChange, onReadError, ...subscribeOptions } = options;
  const values = new Map<string, LiveEntry<T>>();
  /** This field holds the events that come during a read of the snapshot. It is undefined when no read runs. */
  let held: Array<LiveEvent<T>> | undefined;
  let reads = 0;
  let closed = false;
  let settled = false;
  let resolveReady: () => void = () => undefined;
  let rejectReady: (error: unknown) => void = () => undefined;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  // A view that nobody awaits does not give an unhandled rejection
  ready.catch(() => undefined);

  const apply = (event: LiveEvent<T>): void => {
    for (const { key } of event.gone) values.delete(key);
    for (const entry of event.set) values.set(entry.key, entry);
  };
  const applyHeld = (): void => {
    for (const event of held ?? []) apply(event);
    held = undefined;
  };

  const read = async (): Promise<void> => {
    const number = ++reads;
    held = [];
    try {
      const { entries } = await client.call<{ topic: string }, { entries: Array<LiveEntry<T>> }>(pathToMethod([...LIVE_SNAPSHOT_PATH]), { topic });
      if (closed || number !== reads) return;
      values.clear();
      for (const entry of entries) values.set(entry.key, entry);
      applyHeld();
      settled = true;
      resolveReady();
      onChange?.(values);
    } catch (error) {
      if (closed || number !== reads) return;
      applyHeld();
      if (!settled) {
        settled = true;
        rejectReady(error);
      }
      onReadError?.(error);
    }
  };

  const unsubscribe = client.subscribe<LiveEvent<T>>(
    topic,
    (event, meta) => {
      if (closed) return;
      // A loss of events: only a new read gives the keys back
      if (meta.dropped > 0) void read();
      if (held) {
        held.push(event);
        return;
      }
      apply(event);
      onChange?.(values);
    },
    {
      ...subscribeOptions,
      onSubscribed: (topics) => {
        subscribeOptions.onSubscribed?.(topics);
        if (!closed) void read();
      },
    },
  );
  unsubscribe.ready.catch((error: unknown) => {
    if (settled) return;
    settled = true;
    rejectReady(error);
  });

  return {
    values,
    ready,
    close: () => {
      closed = true;
      unsubscribe();
    },
  };
}
