/**
 * The change hints of a `MongoDocumentStorage` collection (roadmap CLI-77). `watchStorageChanges()`
 * watches the change stream of the collection, and publishes each change as a
 * `CollectionChangeEvent` on the topic of the collection procedures. Thus a subscriber also gets
 * the writes that did not go through the procedures: a raw write, a script, another process, a
 * view.
 *
 * - The topic is `collectionChangeTopic(name, partition)`, as the procedures publish it: the
 *   partition of a document comes from `storage.form.partitionOf()`.
 * - The event is a hint, without `since` and without `version` (the version of the change log): the
 *   subscriber reads the changes with `changes`, as for each event without `since`. The event has
 *   the id in `changed` or in `deleted`, and the version of the item in `versions`: the version that
 *   `storage.versionOf(id)` gives (`versionOfStored()`).
 * - A tombstone (a delete through the storage) and a delete of a document are deletes.
 * - The writes of this process through the storage: with `ownWrites: "skip"` (the default), the
 *   watcher skips their events, because the collection procedures publish them already, with
 *   `since`. Thus a subscriber gets one event for each write. With `ownWrites: "publish"`, the
 *   watcher publishes each change. Use it when the writes of this process do not go through the
 *   procedures, or when the procedures publish no events (`changeEvents: false`).
 * - After an error of the stream, the watcher opens the stream again after a backoff, from the
 *   resume token of the last event: it loses no change. When the server does not have the token
 *   any more, or the collection was dropped, the watcher publishes a hint without ids on each
 *   topic that it published on (a gap): the subscribers read the changes.
 * - Change streams need a replica set or a sharded cluster.
 */
import type { ChangeStream, Db, Document } from "mongodb";
import {
  collectionChangeTopic,
  optionalMs,
  realClock,
  type Cancel,
  type Clock,
  type CollectionChangeEvent,
  type ResubscribeBackoff,
} from "@procedures/client";
import { DEFAULT_STORED_FORM, TOMBSTONE_FIELD, storageChangeSource, versionOfStored, type MongoDocumentStorage, type StoredForm } from "./document-storage.js";
import { trackOwnNumbers, type OwnNumbers } from "./own-writes.js";

/** The change of one item of a change event of a `MongoDocumentStorage` collection, from `storageChangeOf()`. */
export interface StorageChange {
  /** The id of the item. */
  readonly id: string;
  /** The partition of the document. */
  readonly partition: string | undefined;
  /** True for a delete: a tombstone, or a delete of the document. */
  readonly deleted: boolean;
  /** The version of the item after the change (`versionOfStored()`). A delete has no version. */
  readonly version?: string | undefined;
  /** The `_seq` of the document after the change, when it has one. */
  readonly seq?: number | undefined;
}

/**
 * The change event of `watchStorageChanges()`: a `CollectionChangeEvent` without `since` (a hint),
 * with the version of each changed item. A subscriber of the collection procedures reads it as each
 * other event.
 */
export interface StorageChangeHint extends CollectionChangeEvent {
  /** The version of each changed item: the version that `storage.versionOf(id)` gives. */
  readonly versions?: ReadonlyArray<{ readonly id: string; readonly version: string }> | undefined;
}

/** The function or the bus that gets the events of `watchStorageChanges()`, for example the bus of the procedures. */
export type StorageHintPublisher = ((topic: string, event: StorageChangeHint) => void | Promise<void>) | { emit(topic: string, event: StorageChangeHint): void };

/** The options of `watchStorageChanges()`. */
export interface WatchStorageChangesOptions {
  /**
   * The name of the collection in the topic: the name of `createCollectionProcedures()`.
   * @default the MongoDB collection of the storage
   */
  collection?: string | undefined;
  /**
   * The topic of the events of a partition, or undefined for no event. Give the same rule as the
   * option `changeEvents.topic` of the procedures.
   * @default `collectionChangeTopic(collection, partition)`
   */
  topic?: ((collection: string, partition: string | undefined) => string | undefined) | undefined;
  /**
   * `skip`: the watcher skips the events of the writes of this process through the storage, because
   * the collection procedures publish them. `publish`: the watcher publishes each change.
   * @default "skip"
   */
  ownWrites?: "skip" | "publish" | undefined;
  /**
   * The backoff before the stream opens again after an error.
   * @default { initialDelay: ms(250), maxDelay: seconds(30), backoffMultiplier: 2, jitter: 1 }
   */
  backoff?: ResubscribeBackoff | undefined;
  /** The clock of the timers (default the clock of the platform). The timers do not keep a process alive. */
  clock?: Clock | undefined;
  /** The log (default `console`, with the prefix `[storage-hints]`). */
  log?: ((level: "info" | "warn" | "error", message: string) => void) | undefined;
}

/** The handle of `watchStorageChanges()`. */
export interface StorageChangesWatch {
  /** It resolves when the first stream is open (each later change reaches the publisher), or when `stop()` runs. */
  readonly ready: Promise<void>;
  /** This method stops the watcher: it closes the stream and cancels the timer of a backoff. */
  stop(): Promise<void>;
}

/** The fields of the storage that the change of an item reads. */
const SEQ = "_seq";
const KEY = "_key";

/** The codes of the errors after which the server does not know the resume token: the watcher opens a new stream and publishes a gap. */
const LOST_TOKEN_CODES: ReadonlySet<number> = new Set([260, 280, 286]);

/** The most partitions whose topics get the hint of a gap. */
const MAX_GAP_PARTITIONS = 10_000;

function asDocument(value: unknown): Document | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Document) : undefined;
}

/**
 * This function reads the change of an item from a change event of a `MongoDocumentStorage`
 * collection (roadmap CLI-77), for an app that watches the collection itself. It gives `undefined`
 * for an event of no item: another operation (for example `drop`), an update whose document is
 * gone (its delete event follows), the delete of a tombstone, or a document whose id neither
 * `idOf` nor `_key` tells.
 *
 * - The partition is `form.partitionOf()` of `fullDocument`, else of `fullDocumentBeforeChange`,
 *   else of `documentKey`.
 * - The id comes from `form.idOf()` of the stored `_id`, else from `_key`.
 * - A tombstone and a delete are deletes. Another change has the version of `versionOfStored()`.
 *
 * @param change - A change event of the collection, with `fullDocument: "updateLookup"` for the updates
 * @param form - The stored form of the storage, for example `storage.form` (default `DEFAULT_STORED_FORM`)
 */
export function storageChangeOf(change: Document, form: StoredForm = DEFAULT_STORED_FORM): StorageChange | undefined {
  const type = change["operationType"];
  if (type !== "insert" && type !== "replace" && type !== "update" && type !== "delete") return undefined;
  const after = type === "delete" ? undefined : asDocument(change["fullDocument"]);
  const before = asDocument(change["fullDocumentBeforeChange"]);
  const key = asDocument(change["documentKey"]);
  const doc = after ?? before ?? key;
  if (!doc) return undefined;
  const partition = form.partitionOf(doc);
  const fromId = form.idOf((key ?? doc)["_id"], partition);
  const keyField = (after ?? before)?.[KEY];
  const id = typeof fromId === "string" ? fromId : typeof keyField === "string" ? keyField : undefined;
  if (id === undefined) return undefined;
  if (!after) {
    // An update whose document is gone: the delete event follows. A delete of a tombstone deletes no item.
    if (type !== "delete" || before?.[TOMBSTONE_FIELD] === true) return undefined;
    return { id, partition, deleted: true };
  }
  const seq = typeof after[SEQ] === "number" ? (after[SEQ] as number) : undefined;
  if (after[TOMBSTONE_FIELD] === true) return { id, partition, deleted: true, ...(seq !== undefined && { seq }) };
  const version = versionOfStored(after, form, partition) ?? "0";
  return { id, partition, deleted: false, version, ...(seq !== undefined && { seq }) };
}

/** The delay before try `attempt` (0 for the first) of a backoff. */
function backoffOf(options: ResubscribeBackoff | undefined): (attempt: number) => number {
  const initial = optionalMs(options?.initialDelay, "backoff.initialDelay") ?? 250;
  const max = optionalMs(options?.maxDelay, "backoff.maxDelay") ?? 30_000;
  const factor = options?.backoffMultiplier ?? 2;
  const jitter = options?.jitter ?? 1;
  if (!(initial >= 0) || !(max >= initial)) throw new RangeError("backoff: initialDelay must be 0 or more, and maxDelay must be initialDelay or more");
  if (!(factor >= 1)) throw new RangeError("backoff: backoffMultiplier must be 1 or more");
  if (!(jitter >= 0 && jitter <= 1)) throw new RangeError("backoff: jitter must be from 0 to 1");
  return (attempt) => {
    const full = Math.min(max, initial * factor ** attempt);
    return full - full * jitter * Math.random();
  };
}

/** The message of an error. */
function messageOf(error: unknown): string {
  return String((error as Error | undefined)?.message ?? error);
}

/**
 * This function watches the change stream of the collection of a `MongoDocumentStorage`, and
 * publishes a hint of each change of an item on the topic of the collection procedures (roadmap
 * CLI-77). The writes that do not go through the procedures (a raw write, another process, a
 * script) then reach the subscribers too. See the module comment for the rules.
 *
 * - The storage of a partition (`forPartition()`) watches only the documents of its partition.
 * - The watcher reads only the collection of the items. The documents of the counters
 *   (`__storage_counters`) are in another collection, and a change there is never a hint.
 * - An error of the publisher goes to the log. It never stops the watcher.
 *
 * @param storage - The storage, for its collection, its database and its stored form
 * @param publish - The function or the bus of the events, for example the bus of the procedures
 * @param options - The topic, the own writes, the backoff, the clock and the log
 * @returns The handle: `ready` and `stop()`
 *
 * @example
 * ```typescript
 * const notes = new MongoDocumentStorage<Note>({ collection: "notes" });
 * const watch = watchStorageChanges(notes, bus); // the bus of the procedures
 * await watch.ready;
 * // ... a raw write of a note reaches the subscribers of collections.notes.<partition>
 * await watch.stop();
 * ```
 */
export function watchStorageChanges<T>(storage: MongoDocumentStorage<T>, publish: StorageHintPublisher, options: WatchStorageChangesOptions = {}): StorageChangesWatch {
  const source = storageChangeSource(storage);
  const name = options.collection ?? source.collection;
  const topicOf = options.topic ?? ((collection: string, partition: string | undefined): string | undefined => collectionChangeTopic(collection, partition));
  const clock = options.clock ?? realClock;
  const log = options.log ?? ((level: "info" | "warn" | "error", message: string): void => console[level === "info" ? "log" : level](`[storage-hints] ${message}`));
  const emit: (topic: string, event: StorageChangeHint) => void | Promise<void> = typeof publish === "function" ? publish : publish.emit.bind(publish);
  const delayOf = backoffOf(options.backoff);
  const skipOwn = (options.ownWrites ?? "skip") === "skip";
  if (options.ownWrites !== undefined && options.ownWrites !== "skip" && options.ownWrites !== "publish") throw new TypeError('ownWrites must be "skip" or "publish"');

  let stopped = false;
  let stream: ChangeStream | undefined;
  let token: unknown;
  /** True after a stream was open: a new stream without a token can then miss changes. */
  let opened = false;
  let attempt = 0;
  let timer: Cancel | undefined;
  let own: OwnNumbers | undefined;
  /** The partitions that got a hint: the topics of a gap. */
  const partitions = new Set<string | undefined>();
  let markReady: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });

  const send = (partition: string | undefined, event: StorageChangeHint): void => {
    let topic: string | undefined;
    try {
      topic = topicOf(name, partition);
      if (topic === undefined) return;
      const result: unknown = emit(topic, event);
      if (result instanceof Promise) result.catch((error: unknown) => log("error", `the publish on ${topic} failed: ${messageOf(error)}`));
    } catch (error) {
      log("error", `the publish on ${topic ?? name} failed: ${messageOf(error)}`);
    }
  };

  /** The hint of a gap: the subscribers read the changes. */
  const gap = (reason: string): void => {
    log("warn", `${reason}: the subscribers read the changes`);
    const topics = source.partition !== undefined ? [source.partition] : [undefined, ...partitions];
    for (const partition of new Set(topics)) send(partition, { changed: [], deleted: [] });
  };

  const onChange = (change: Document): void => {
    token = change["_id"];
    attempt = 0;
    const type = change["operationType"];
    if (type === "drop" || type === "rename" || type === "dropDatabase") return gap(`the collection ${source.collection} had a ${String(type)}`);
    const ns = asDocument(change["ns"]);
    if (ns?.["coll"] === source.counters) return;
    let item: StorageChange | undefined;
    try {
      item = storageChangeOf(change, source.form);
    } catch (error) {
      log("warn", `a change of ${source.collection} has no item: ${messageOf(error)}`);
      return;
    }
    if (!item) return;
    // The event of a write of this process: the collection procedures publish it
    if (own && item.seq !== undefined && own.take(item.seq)) return;
    if (source.partition !== undefined && item.partition !== source.partition) return;
    if (partitions.size < MAX_GAP_PARTITIONS) partitions.add(item.partition);
    send(
      item.partition,
      item.deleted ? { changed: [], deleted: [item.id] } : { changed: [item.id], deleted: [], versions: [{ id: item.id, version: item.version ?? "0" }] }
    );
  };

  const schedule = (reason: string): void => {
    if (stopped) return;
    const delay = delayOf(attempt++);
    log("warn", `${reason}: the stream of ${source.collection} opens again in ${Math.round(delay)} ms`);
    timer = clock.after(delay, () => {
      timer = undefined;
      void open();
    });
    timer.unref?.();
  };

  const open = async (): Promise<void> => {
    if (stopped) return;
    let db: Db;
    try {
      db = await source.db();
    } catch (error) {
      return schedule(`the database is not available (${messageOf(error)})`);
    }
    if (stopped) return;
    if (skipOwn) own ??= trackOwnNumbers(db, source.collection);
    if (token === undefined && opened) gap(`the stream of ${source.collection} opens again without a resume token`);
    let next: ChangeStream;
    try {
      next = db.collection(source.collection).watch([], {
        fullDocument: "updateLookup",
        fullDocumentBeforeChange: "whenAvailable",
        ...(token !== undefined && { startAfter: token }),
      });
    } catch (error) {
      return schedule(`the stream cannot open (${messageOf(error)})`);
    }
    stream = next;
    let ended = false;
    const end = (reason: string, error?: unknown): void => {
      if (ended) return;
      ended = true;
      next.close().catch(() => undefined);
      if (stream !== next || stopped) return;
      stream = undefined;
      const code = (error as { code?: unknown } | undefined)?.code;
      if (typeof code === "number" && LOST_TOKEN_CODES.has(code) && token !== undefined) {
        // The next stream starts now, without the token: it publishes a gap
        log("warn", `the server does not know the resume token of ${source.collection} (code ${code})`);
        token = undefined;
      }
      schedule(`the stream ${reason}`);
    };
    next.on("resumeTokenChanged", (resumeToken: unknown) => {
      if (resumeToken === undefined || resumeToken === null) return;
      token = resumeToken;
      opened = true;
      attempt = 0;
      markReady();
    });
    next.on("change", (change: Document) => {
      opened = true;
      markReady();
      if (change["operationType"] === "invalidate") {
        // The collection was dropped or renamed: the stream starts after the invalidate event
        token = change["_id"];
        return end("ended (invalidate)");
      }
      onChange(change);
    });
    next.on("error", (error: Error) => end(`failed: ${error.message}`, error));
    next.on("close", () => end("closed"));
  };

  void open();

  return {
    ready,
    async stop(): Promise<void> {
      if (stopped) return;
      stopped = true;
      timer?.();
      timer = undefined;
      own?.close();
      own = undefined;
      markReady();
      const current = stream;
      stream = undefined;
      await current?.close().catch(() => undefined);
    },
  };
}
