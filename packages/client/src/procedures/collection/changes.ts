/**
 * The change events of the collection procedures (roadmap CLI-15).
 *
 * Each write of a collection procedure publishes one `CollectionChangeEvent` on the bus of its
 * context (`ctx.bus`), under the topic `collections.<name>`. A peer gets the events with
 * `events.subscribe` (`documentation/EVENTS.md`). The delivery is at most once, so an event is a
 * hint of a change, and a subscriber reads the changes when it misses an event.
 *
 * - `since` and `version` are versions of `getChangesSince()` of the storage. The events of one
 *   storage and one topic make a chain: the `since` of an event is the `version` of the event
 *   before it. A subscriber whose cursor is `since` applies the event without a read.
 * - The changes of an event come from the change log of the storage, not from the input of the
 *   write. Thus an event also has the writes that did not go through the procedures.
 * - By default, an event has only the ids and the versions: a value reaches a caller only through
 *   a read, with its checks. With the option `values`, an event has the values too, and each row
 *   `{ id, value }` passes the output filter of the host for each subscriber (`withRows()`).
 * - A subscriber of the topic must have a capability that reads `collection:<name>`, as for a
 *   read (`collectionTopicReads()`, the default `reads` of `EventPublisher`).
 * - An event without `since` only tells that the collection changed: the storage has no change
 *   log, the chain starts, or the log dropped the version. The subscriber then reads the changes.
 * - The chain starts at the version of a call of `changes` (a pull of a subscriber). While no one
 *   listens to the topic, the procedures publish nothing, and the chain stops.
 * - The publishes of one storage and one topic run one at a time, in the order of the writes. A
 *   write resolves after its event is on the bus. A failed publish never fails the write.
 * - The writes that end while a publish runs share the next publish, so one read of the change
 *   log replies to all of them. At most one publish runs, and at most one publish waits.
 * - A version can stop below a write in flight (`StorageChanges.held`, roadmap CLI-102). The chain
 *   then reads the log again, after a wait that starts at 100 ms and doubles up to 5 s. It stops when
 *   no write holds the version or no one listens. Thus a write that a write in flight holds back
 *   reaches the subscribers with no later write. The event of such a read has no origin. It has
 *   no rows before the changes, so a row filter makes a hint without ids.
 * - The log can give a write two times (`StorageChanges`), so a subscriber applies a change by its id.
 * - A read with no change sends no event, and the chain keeps its version. The version of a log can
 *   move with no change, when another process writes a row again at a later number.
 * - With the rule `admission.admit`, the publisher filters the ids of each event for each
 *   subscriber (roadmap CLI-78, `hint-filter.ts`). The event carries the rows after the changes,
 *   from the change log. While a subscriber has a filter, each write first reads the rows before
 *   it (`getBatch`). Thus a row that leaves the rule reaches that subscriber as a delete.
 */

import type { EventBus } from "../../events/types.js";
import { withRows } from "../../events/rows.js";
import type { AdmitItem } from "../invoke.js";
import type { StorageChanges } from "./storage.js";
import type { CollectionAdmission } from "./admission.js";
import { hasFilteredSubscriber, withHintImages, type HintRowState } from "./hint-filter.js";
import type { RepositoryProvider } from "../types.js";
import { collectionTopicTarget } from "./topic.js";

/**
 * The change event of the writes of a collection, on the topic `collections.<name>` (roadmap
 * CLI-15). The data crosses the wire as JSON.
 */
export interface CollectionChangeEvent {
  /**
   * The version of the storage before the changes. A subscriber whose cursor is this version
   * applies the changes without a read. Without it, the event is only a hint: read the changes.
   */
  readonly since?: string | undefined;
  /** The version of the storage after the changes, when the storage has a change log. */
  readonly version?: string | undefined;
  /** The ids of the items that changed, in the order of the last change of each id. */
  readonly changed: readonly string[];
  /** The ids that were deleted. */
  readonly deleted: readonly string[];
  /**
   * With the option `values`: the changed items that the output filter of the subscriber admits.
   * Without the option, the event has no values: read them with `changes`.
   */
  readonly values?: ReadonlyArray<{ readonly id: string; readonly value: unknown }> | undefined;
  /**
   * With the option `values`: the changed ids whose values the output filter of the host refused.
   * Read them with `changes`. A row that the rule of the rows refuses is not in the event (roadmap CLI-78).
   */
  readonly withheld?: readonly string[] | undefined;
  /**
   * The version of each changed item, as `versionOf(id)` of the storage gives it (roadmap CLI-77).
   * A publisher that knows the versions sets it, for example `watchStorageChanges()` of
   * `@procedures/mongo`. Without it, read the versions with `changes`. A deleted id has no version.
   */
  readonly versions?: ReadonlyArray<{ readonly id: string; readonly version: string }> | undefined;
  /**
   * True: read the collection in full, with `changes` and no `since` (roadmap CLI-77). A publisher
   * sets it when it cannot tell what changed, for example `watchStorageChanges()` of
   * `@procedures/mongo` after it lost its resume token. A read since the cursor can miss changes.
   */
  readonly reset?: boolean | undefined;
  /** The origin of the writes, when one origin made all the changes of the event. */
  readonly origin?: string | undefined;
}

export { collectionChangeTopic } from "./topic.js";

/**
 * This function gives the resources that a subscriber of a topic reads: `collection:<name>` for
 * the topic `collections.<name>` and for a topic of a partition, `collections.<name>.<partition>`.
 * Another topic gives no resource. `EventPublisher` uses it as its default `reads`, with the
 * repository of the call.
 *
 * It reads the topic with `collectionTopicTarget()`, the parse of the listener of the publisher
 * (roadmap CLI-42). The name in the topic is encoded (roadmap CLI-75): the topic
 * `collections.graph%2Enodes` reads `collection:graph.nodes`. The repository is not used since CLI-75.
 */
export function collectionTopicReads(topic: string, repository?: RepositoryProvider): readonly string[] {
  const target = collectionTopicTarget(topic, repository);
  return target ? [`collection:${target.collection}`] : [];
}

/** The part of a storage that the change events read. */
interface ChangeLog {
  getChangesSince?(since?: string): Promise<StorageChanges<unknown>>;
  /** The stored items of the ids: the rows before a write, for the row filter of the subscribers (roadmap CLI-78). */
  getBatch?(ids: string[]): Promise<Map<string, unknown>>;
}

/** The first wait before a read again of a log that a write in flight holds back. */
const HELD_FIRST_MS = 100;
/** The longest wait before a read again. */
const HELD_MOST_MS = 5000;

/** A write that ended, and that no event told yet. */
interface EndedWrite {
  /** The ids of the write, or "*" for a clear. */
  readonly ids: readonly string[] | "*";
  readonly origin: string | undefined;
  /** True when the chain had a version when the write started. */
  readonly anchored: boolean;
  /** The stored items of the ids before the write, when a subscriber has a row filter (roadmap CLI-78). */
  before?: ReadonlyMap<string, unknown> | undefined;
}

/** The chain of the events of one storage and one topic. */
interface ChangeChain {
  /** The `version` of the last event, or of a call of `changes`: the `since` of the next event. */
  anchor: string | undefined;
  /** The publishes, one at a time. */
  tail: Promise<void>;
  /** The publish that did not start. A write that ends joins it, because it reads the writes that ended before its start. */
  next: Promise<void> | undefined;
  /** The writes that ended since the last publish. */
  readonly ended: EndedWrite[];
  /** True when the next publish reads the log with no write that ended. */
  owed: boolean;
  /** The last wait before a read again, or 0 when no write in flight holds the log back. */
  heldWaitMs: number;
  /** The timer of the next read again. */
  heldTimer: ReturnType<typeof setTimeout> | undefined;
}

/** This function gives the publish that did not start, and it makes one when none waits. A failed publish rejects nothing here. */
function nextPublish(chain: ChangeChain, start: () => Promise<void>): Promise<void> {
  if (chain.next) return chain.next;
  const next = chain.tail
    .then(() => {
      chain.next = undefined;
      return start();
    })
    .catch(() => undefined);
  chain.next = next;
  chain.tail = next;
  return next;
}

/** The chains of each storage, by topic. A storage that goes away takes its chains with it. */
const CHAINS = new WeakMap<object, Map<string, ChangeChain>>();

function chainOf(storage: object, topic: string): ChangeChain {
  let topics = CHAINS.get(storage);
  if (!topics) {
    topics = new Map();
    CHAINS.set(storage, topics);
  }
  let chain = topics.get(topic);
  if (!chain) {
    chain = { anchor: undefined, tail: Promise.resolve(), next: undefined, ended: [], owed: false, heldWaitMs: 0, heldTimer: undefined };
    topics.set(topic, chain);
  }
  return chain;
}

/** The origin of an event: the one origin of its writes, when the changes are only of these writes. */
function originOf(writes: readonly EndedWrite[], changes: StorageChanges<unknown> | undefined): string | undefined {
  const origin = writes[0]?.origin;
  if (origin === undefined || writes.some((write) => write.origin !== origin)) return undefined;
  if (!changes || writes.some((write) => write.ids === "*")) return origin;
  const ids = new Set<string>();
  for (const write of writes) for (const id of write.ids as readonly string[]) ids.add(id);
  const own = changes.changed.every(([id]) => ids.has(id)) && changes.deleted.every((id) => ids.has(id));
  return own ? origin : undefined;
}

/** A hint: the collection changed, and the subscriber reads the changes. */
function hint(version: string | undefined, origin: string | undefined): CollectionChangeEvent {
  return {
    ...(version !== undefined && { version }),
    changed: [],
    deleted: [],
    ...(origin !== undefined && { origin }),
  };
}

/**
 * The event of a delta with the values of the changed items. Each row `{ id, value }` passes the
 * output filter of each subscriber and the rule of the rows of the collection, and a refused row
 * goes from `values` to `withheld`. The row filter of a subscriber (roadmap CLI-78) first takes the
 * rows that the rule refuses out of the event. Thus only the output filter of the host withholds a row.
 */
function withValues(event: CollectionChangeEvent, entries: ReadonlyArray<{ readonly id: string; readonly value: unknown }>, admit: AdmitItem | undefined): CollectionChangeEvent {
  return withRows(
    { ...event, values: entries },
    {
      rows: entries,
      // The rule of the rows of the collection (roadmap CLI-41): each subscriber applies it too
      ...(admit && { admit }),
      keep: (admitted) => {
        const withheld = entries.filter((_, index) => !admitted[index]).map(({ id }) => id);
        return {
          ...event,
          values: entries.filter((_, index) => admitted[index]),
          ...(withheld.length > 0 && { withheld }),
        };
      },
    },
  );
}

/** This function starts the timer of the next read again while a write holds the log back, and it stops the timer otherwise. */
function whileHeld(chain: ChangeChain, held: boolean, read: () => void): void {
  if (!held) {
    chain.heldWaitMs = 0;
    if (chain.heldTimer !== undefined) clearTimeout(chain.heldTimer);
    chain.heldTimer = undefined;
    return;
  }
  if (chain.heldTimer !== undefined) return;
  chain.heldWaitMs = Math.min(HELD_MOST_MS, chain.heldWaitMs * 2 || HELD_FIRST_MS);
  chain.heldTimer = setTimeout(() => {
    chain.heldTimer = undefined;
    read();
  }, chain.heldWaitMs);
  chain.heldTimer.unref?.();
}

/** One publish: the event of the writes that ended since the last publish, and of a read again. */
async function publish(chain: ChangeChain, storage: ChangeLog, bus: EventBus, topic: string, values: boolean, admission: CollectionAdmission | undefined): Promise<void> {
  const admit = admission?.admit;
  const writes = chain.ended.splice(0);
  const owed = chain.owed;
  chain.owed = false;
  // An earlier publish told these writes
  if (writes.length === 0 && !owed) return;
  const readAgain = (): void => rereadChain(chain, storage, bus, topic, values, admission);
  if (!bus.hasSubscribers(topic)) {
    // No one listens: the procedures do not read the log. The next call of `changes` starts the chain again.
    chain.anchor = undefined;
    whileHeld(chain, false, readAgain);
    return;
  }
  const since = chain.anchor;
  if (!storage.getChangesSince || since === undefined) {
    if (writes.length > 0) bus.emit(topic, hint(undefined, originOf(writes, undefined)));
    return;
  }
  let changes: StorageChanges<unknown>;
  try {
    changes = await storage.getChangesSince(since);
  } catch {
    // The subscribers read the changes themselves. The chain keeps its version.
    if (writes.length > 0) bus.emit(topic, hint(undefined, originOf(writes, undefined)));
    // A read again that failed told no subscriber, so it stays owed
    else whileHeld(chain, true, readAgain);
    return;
  }
  whileHeld(chain, changes.held === true, readAgain);
  // A full result: the log does not know the version of the chain any more
  if (changes.full || writes.some((write) => !write.anchored)) {
    chain.anchor = changes.version;
    bus.emit(topic, hint(changes.version, originOf(writes, undefined)));
    return;
  }
  // No event tells this version, so the chain stays at the version of the last event. The next read from it gets each change.
  if (changes.changed.length === 0 && changes.deleted.length === 0) return;
  chain.anchor = changes.version;
  const origin = originOf(writes, changes);
  const event: CollectionChangeEvent = {
    since,
    version: changes.version,
    changed: changes.changed.map(([id]) => id),
    deleted: changes.deleted,
    ...(origin !== undefined && { origin }),
  };
  const out = values ? withValues(event, changes.changed.map(([id, value]) => ({ id, value })), admit) : event;
  // The rows of the event for the row filter of each subscriber (roadmap CLI-78)
  bus.emit(topic, admit ? withHintImages(out, { after: afterOf(changes), before: beforeOf(writes), admission: admission! }) : out);
}

/** This function reads the log of a chain again. A publish that did not start does this read. */
function rereadChain(chain: ChangeChain, storage: ChangeLog, bus: EventBus, topic: string, values: boolean, admission: CollectionAdmission | undefined): void {
  chain.owed = true;
  void nextPublish(chain, () => publish(chain, storage, bus, topic, values, admission));
}

/** The rows after the changes, from the change log: a changed id has its item, a deleted id has none. */
function afterOf(changes: StorageChanges<unknown>): Map<string, HintRowState> {
  const after = new Map<string, HintRowState>();
  for (const id of changes.deleted) after.set(id, { found: false });
  for (const [id, value] of changes.changed) after.set(id, { found: true, value });
  return after;
}

/**
 * The rows before the changes: for each id, the read of the first write that read it. An id
 * without a read is unknown, so the filter of a subscriber makes a hint without ids for it.
 */
function beforeOf(writes: readonly EndedWrite[]): Map<string, HintRowState> {
  const before = new Map<string, HintRowState>();
  for (const write of writes) {
    if (!write.before || write.ids === "*") continue;
    for (const id of write.ids) {
      if (before.has(id)) continue;
      before.set(id, write.before.has(id) ? { found: true, value: write.before.get(id) } : { found: false });
    }
  }
  return before;
}

/**
 * This function runs a write of a collection procedure, and then publishes the change event of
 * the write on the bus. Without a bus or a topic, it only runs the write. A failed write
 * publishes too, because a batch can change a part of the storage. The error of the publish
 * never reaches the caller.
 *
 * @param bus - The bus of the context, or undefined
 * @param storage - The storage of the collection: the chain of the events belongs to it
 * @param topic - The topic of the events, or undefined for no event
 * @param ids - The ids of the write, or "*" for a clear
 * @param origin - The origin of the write
 * @param write - The write
 * @param values - True: the events carry the values, for the output filter of each subscriber
 * @param admission - The rules of the rows of the collection: each subscriber applies `admit` to the rows of the event (roadmap CLI-41, CLI-78)
 */
export async function writeWithChangeEvent<R>(
  bus: EventBus | undefined,
  storage: object & ChangeLog,
  topic: string | undefined,
  ids: readonly string[] | "*",
  origin: string | undefined,
  write: () => Promise<R>,
  values = false,
  admission?: CollectionAdmission,
): Promise<R> {
  if (bus === undefined || topic === undefined) return write();
  const chain = chainOf(storage, topic);
  const started: EndedWrite = { ids, origin, anchored: chain.anchor !== undefined };
  // A subscriber with a row filter: the rows before the write tell it which rows left the rule (roadmap CLI-78)
  if (admission?.admit && ids !== "*" && ids.length > 0 && storage.getBatch && hasFilteredSubscriber(bus, topic) && bus.hasSubscribers(topic)) {
    try {
      started.before = await storage.getBatch([...ids]);
    } catch {
      // Without the rows before the write, the filter of a subscriber makes a hint without ids
    }
  }
  try {
    return await write();
  } finally {
    chain.ended.push(started);
    await nextPublish(chain, () => publish(chain, storage, bus, topic, values, admission));
  }
}

/**
 * This function starts the chain of the events of a storage at the version of a call of
 * `changes`, when the chain has no version. The subscriber that made the call then applies the
 * next event without a read.
 */
export function startChangeChain(bus: EventBus | undefined, storage: object, topic: string | undefined, version: string): void {
  if (bus === undefined || topic === undefined) return;
  const chain = chainOf(storage, topic);
  if (chain.anchor === undefined) chain.anchor = version;
}

/**
 * This function makes the chain read the log again when a call of `changes` gets a version that a
 * write in flight holds back. A write outside the procedures then reaches the subscribers too.
 * With no bus, no topic or no subscriber, it does nothing.
 */
export function rereadWhileHeld(bus: EventBus | undefined, storage: object & ChangeLog, topic: string | undefined, values = false, admission?: CollectionAdmission): void {
  if (bus === undefined || topic === undefined || !bus.hasSubscribers(topic)) return;
  const chain = chainOf(storage, topic);
  whileHeld(chain, true, () => rereadChain(chain, storage, bus, topic, values, admission));
}
