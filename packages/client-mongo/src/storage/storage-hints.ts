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
 *   the id in `changed` or in `deleted`, and the version of the item in `versions` (a field of
 *   `CollectionChangeEvent`): the version that `storage.versionOf(id)` gives after the write.
 * - A write through the storage gives the document a new `_seq`. The watcher reads that from the
 *   event, never from the `fullDocument` of the lookup: an update with `_seq` in
 *   `updateDescription.updatedFields`, an insert or a replace with `_seq`. With the image before
 *   the change, a replace whose `_seq` is the `_seq` before is a raw write (a copy). Without the
 *   image, a replace with `_seq` counts as a write of the storage.
 * - A raw write (D39), with `rawWrites: "adopt"` (the default): the watcher publishes nothing for
 *   its event. The storage adopts it: one conditional write through the path of each write gives
 *   the document a new `_seq` (and the storage fields and partition fields that a raw replace took
 *   away), so `changes(since)` has it. The event of the adoption is a write of the storage: its
 *   hint goes out, with the new version. When two watchers adopt the same write, or a write of the
 *   storage comes first, one write wins and the others do nothing. A raw write never gets the old
 *   version. With `rawWrites: "ignore"` (for example for a user that can only read), the hint of a
 *   raw write goes out without a version, and `changes(since)` does not have the write.
 * - The adoptions wait in one queue for each watcher: one adoption at a time, and the raw writes
 *   that wait together take one block of numbers for each partition. An adoption that fails with
 *   an error that can go away tries again after the backoff. After the last try, the partition gets
 *   a gap hint: its subscribers read the changes.
 * - The adoption is exact only with the images before the change (`changeStreamPreAndPostImages`).
 *   An insert and a replace show their document, but an update shows only its fields: without the
 *   image, the `_seq` that the update kept comes from the lookup. When a write of the storage comes
 *   after the raw update, the adoption can then give that write a newer version, and a client that
 *   holds the version of that write gets a conflict of its precondition.
 * - The sweep (`sweep`, on by default with `rawWrites: "adopt"`): when the stream opens, and after
 *   each gap, the watcher sends each document without `_seq` to the same queue, in pages. Thus the
 *   raw writes before the watcher started, or during a gap, get their numbers too.
 * - A raw hard delete of an item: with the image before the change, the storage adopts it as a
 *   tombstone. Without the image (no `changeStreamPreAndPostImages` on the collection), the hint
 *   goes out without a version, and the delete stays out of `changes(since)`.
 * - A delete of a tombstone (the storage prunes the oldest ones) deletes no item: no hint, no
 *   adoption. The image before the change tells it. Without the image, the watcher knows the
 *   prunes of this process only.
 * - The writes of this process through the storage: with `ownWrites: "skip"` (the default), the
 *   watcher skips their events, because the collection procedures publish them already, with
 *   `since`. Thus a subscriber gets one event for each write. With `ownWrites: "publish"`, the
 *   watcher publishes each change. Use it when the writes of this process do not go through the
 *   procedures, or when the procedures publish no events (`changeEvents: false`). An adoption is
 *   never an own write.
 * - After an error of the stream, the watcher opens the stream again after a backoff, from the
 *   resume token of the last event: it loses no change. When the server does not have the token
 *   any more, or the collection was dropped, the watcher publishes a hint without ids (a gap) on
 *   the plain topic and on the topic of each partition that it knows: the partitions of the
 *   counters, of `forPartition()`, of the hints, of the subscribed topics of the bus, and of
 *   `gapPartitions`. The subscribers read the changes.
 * - The pipeline of the stream is `[]`: the storage of a partition (`forPartition()`) watches the
 *   whole collection and drops the events of other partitions.
 * - Change streams need a replica set or a sharded cluster. The watcher asks the server (`hello`)
 *   before the first open: on a single server, `ready` rejects (code 40573).
 */
import { MongoAPIError, MongoParseError, BSON, type ChangeStream, type Db, type Document } from "mongodb";
import {
  collectionChangeTopic,
  collectionTopicPartition,
  optionalMs,
  realClock,
  type Cancel,
  type Clock,
  type CollectionChangeEvent,
  type ResubscribeBackoff,
} from "@procedures/client";
import {
  DEFAULT_STORED_FORM,
  TOMBSTONE_FIELD,
  storageChangeSource,
  versionOfStored,
  type MongoDocumentStorage,
  type RawAdoptionResult,
  type RawStorageWrite,
  type StoredForm,
} from "./document-storage.js";
import { trackOwnNumbers, type OwnNumbers } from "./own-writes.js";

/** The change of one item of a change event of a `MongoDocumentStorage` collection, from `storageChangeOf()`. */
export interface StorageChange {
  /** The id of the item. */
  readonly id: string;
  /** The partition of the document. */
  readonly partition: string | undefined;
  /** True for a delete: a tombstone, or a delete of the document. */
  readonly deleted: boolean;
  /**
   * True for a raw write: a write that did not give the document a new `_seq` (see the module
   * comment), and each delete of a document that is not a tombstone.
   */
  readonly raw: boolean;
  /** The version of the item after a write of the storage (`versionOfStored()`). A delete and a raw write have no version. */
  readonly version?: string | undefined;
  /** The new `_seq` of a write of the storage, or the `_seq` that a raw write kept (none for a document without `_seq`). */
  readonly seq?: number | undefined;
}

/**
 * The change event of `watchStorageChanges()`: a `CollectionChangeEvent` without `since` (a hint),
 * with the version of each changed item in `versions`. A subscriber of the collection procedures
 * reads it as each other event. It is an alias of `CollectionChangeEvent`.
 */
export type StorageChangeHint = CollectionChangeEvent;

/**
 * The function or the bus that gets the events of `watchStorageChanges()`, for example the bus of
 * the procedures. A bus with `channels()` (the `EventBus` of `@procedures/client`) also tells the
 * subscribed topics: the hint of a gap goes to their partitions.
 */
export type StorageHintPublisher =
  | ((topic: string, event: StorageChangeHint) => void | Promise<void>)
  | { emit(topic: string, event: StorageChangeHint): void; channels?(): readonly string[] };

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
   * `adopt`: the storage gives each raw write a new `_seq`, so `changes(since)` has it, and the hint
   * goes out with the new version (D39). The watcher needs write access. `ignore`: the hint of a raw
   * write goes out without a version, and the storage writes nothing (for a user that can only read).
   * @default "adopt"
   */
  rawWrites?: "adopt" | "ignore" | undefined;
  /**
   * More partitions for the hint of a gap. The host gives the partitions that its subscribers
   * subscribed to, when the publisher cannot tell them (a function, or a bus without
   * `channels()`). The watcher adds the plain topic, the partitions of the counters and of
   * `forPartition()`, the partitions of the hints, and the subscribed topics of the bus. A
   * partition of the counters has a floor document only after a prune. For a complete gap, give
   * `gapPartitions`. Otherwise a partition gets a gap hint only after a prune, a write that this
   * watcher saw, or an open forPartition() storage here.
   */
  gapPartitions?: (() => Iterable<string | undefined>) | undefined;
  /**
   * True: when the stream opens, and after each gap, the watcher adopts each document without
   * `_seq` (a raw write before the watcher started, or during the gap), in pages, through the queue
   * of the adoptions. It needs `rawWrites: "adopt"`.
   * @default true with `rawWrites: "adopt"`, else false
   */
  sweep?: boolean | undefined;
  /**
   * The backoff before the stream opens again after an error.
   * @default { initialDelay: ms(250), maxDelay: seconds(30), backoffMultiplier: 2, jitter: 1 }
   */
  backoff?: ResubscribeBackoff | undefined;
  /** The clock of the timers and of the time limit of the own writes (default the clock of the platform). The timers do not keep a process alive. */
  clock?: Clock | undefined;
  /** The log (default `console`, with the prefix `[storage-hints]`). */
  log?: ((level: "info" | "warn" | "error", message: string) => void) | undefined;
}

/** The handle of `watchStorageChanges()`. */
export interface StorageChangesWatch {
  /**
   * It resolves when the first stream is open (each later change reaches the publisher), or when
   * `stop()` runs. It rejects when the first open fails with an error that does not go away (a
   * single server, a refused authentication or permission): the watcher then stops. The watcher
   * opens the stream again after the other errors.
   */
  readonly ready: Promise<void>;
  /** This method stops the watcher: it closes the stream and cancels the timer of a backoff. */
  stop(): Promise<void>;
}

/** A raw write that waits for its adoption. `done` ends a write of the sweep. */
interface AdoptJob {
  readonly item: StorageChange;
  readonly raw: RawStorageWrite;
  readonly tries: number;
  readonly done?: (() => void) | undefined;
}

/** The fields of the storage that the change of an item reads. */
const SEQ = "_seq";
const KEY = "_key";

/** The codes of the errors after which the server does not know the resume token: the watcher opens a new stream and publishes a gap. */
const LOST_TOKEN_CODES: ReadonlySet<number> = new Set([260, 280, 286]);

/** The codes of a refused access: Unauthorized, AuthenticationFailed, and the access error of Atlas. */
const REFUSED_CODES: ReadonlySet<number> = new Set([13, 18, 8000]);

/** The codes of the errors of a first open that do not go away: a refused access, no change streams on a single server (40573), a command that the server does not know (115). */
const PERMANENT_CODES: ReadonlySet<number> = new Set([...REFUSED_CODES, 40573, 115]);

/** The most partitions whose topics get the hint of a gap. */
const MAX_GAP_PARTITIONS = 10_000;

/** The most raw writes of one adoption: they take one block of numbers for each partition. */
const ADOPT_BATCH = 100;

/** The most raw writes that wait for an adoption. The hint of a raw write over the limit goes out without a version. */
const MAX_ADOPT_QUEUE = 10_000;

/** The tries of an adoption that fails with an error that can go away. */
const ADOPT_TRIES = 5;

/** The documents of one page of the sweep. */
const SWEEP_PAGE = 500;

/** The code of a command that the server does not know (an old server without `hello`). */
const COMMAND_NOT_FOUND = 59;

function asDocument(value: unknown): Document | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Document) : undefined;
}

function seqOf(doc: Document | undefined): number | undefined {
  const seq = doc?.[SEQ];
  return typeof seq === "number" ? seq : undefined;
}

/** The new `_seq` of a write of the storage, read from the event, or undefined for a raw write. */
function writtenSeq(type: string, change: Document, after: Document, before: Document | undefined): number | undefined {
  if (type === "update") return seqOf(asDocument(asDocument(change["updateDescription"])?.["updatedFields"]));
  const seq = seqOf(after);
  // A replace that copies the `_seq` of the document before it is a raw write. It needs the image before the change.
  if (seq !== undefined && type === "replace" && before !== undefined && seqOf(before) === seq) return undefined;
  return seq;
}

/** The `_seq` of the document after a raw write: the state that the event saw. */
function keptSeq(type: string, change: Document, after: Document, before: Document | undefined): number | undefined {
  if (type !== "update") return seqOf(after);
  const removed = asDocument(change["updateDescription"])?.["removedFields"];
  if (Array.isArray(removed) && removed.includes(SEQ)) return undefined;
  // An update that did not touch `_seq` keeps the `_seq` before it. Without the image, the lookup tells it.
  return seqOf(before ?? after);
}

/**
 * This function reads the change of an item from a change event of a `MongoDocumentStorage`
 * collection (roadmap CLI-77), for an app that watches the collection itself. It gives `undefined`
 * for an event of no item: another operation (for example `drop`), an update whose document is
 * gone (its delete event follows), the delete of a tombstone, or a document whose id neither
 * `idOf` nor `_key` tells.
 *
 * - The partition is `form.partitionOf()` of `fullDocumentBeforeChange`, else of `fullDocument`,
 *   else of `documentKey`: the first whose partition gives the id with `form.idOf()` of the stored
 *   `_id`. Else the id is `_key`, in the partition of the first document.
 * - A tombstone and a delete are deletes.
 * - `raw` tells a raw write, from the event only (see the module comment). A write of the storage
 *   has the version of its new `_seq`. A raw write has no version.
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
  // The partition: of the image before the change, else of the document after it, else of the stored _id (the order of the adoption)
  const places = [before, after, key].filter((doc): doc is Document => doc !== undefined);
  if (places.length === 0) return undefined;
  const storedId = (key ?? places[0]!)["_id"];
  let partition: string | undefined;
  let id: string | undefined;
  for (const doc of places) {
    const place = form.partitionOf(doc);
    const fromId = form.idOf(storedId, place);
    if (typeof fromId === "string") {
      partition = place;
      id = fromId;
      break;
    }
  }
  if (id === undefined) {
    // No partition tells the id through the form: the id is `_key`, in the first partition
    const keyField = (after ?? before)?.[KEY];
    if (typeof keyField !== "string") return undefined;
    partition = form.partitionOf(places[0]!);
    id = keyField;
  }
  if (!after) {
    // An update whose document is gone: the delete event follows. A delete of a tombstone deletes no item.
    if (type !== "delete" || before?.[TOMBSTONE_FIELD] === true) return undefined;
    // The storage deletes an item with a tombstone: a delete of an item is a raw write
    return { id, partition, deleted: true, raw: true };
  }
  const deleted = after[TOMBSTONE_FIELD] === true;
  const written = writtenSeq(type, change, after, before);
  if (written === undefined) {
    const seq = keptSeq(type, change, after, before);
    return { id, partition, deleted, raw: true, ...(seq !== undefined && { seq }) };
  }
  if (deleted) return { id, partition, deleted: true, raw: false, seq: written };
  const version = versionOfStored({ ...after, [SEQ]: written }, form, partition) ?? String(written);
  return { id, partition, deleted: false, raw: false, version, seq: written };
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

function codeOf(error: unknown): number | undefined {
  const code = (error as { code?: unknown } | undefined)?.code;
  return typeof code === "number" ? code : undefined;
}

/** True for a refused access: the user may not write (or read) the collection. */
function isRefused(error: unknown): boolean {
  const code = codeOf(error);
  return code !== undefined && REFUSED_CODES.has(code);
}

/** True for an error of a first open that does not go away: a single server, a refused access, a wrong option. */
function isPermanent(error: unknown): boolean {
  const code = codeOf(error);
  if (code !== undefined && PERMANENT_CODES.has(code)) return true;
  return error instanceof MongoAPIError || error instanceof MongoParseError;
}

/** A stored `_id` for the log. */
function describeId(storedId: unknown): string {
  try {
    return BSON.EJSON.stringify({ _id: storedId as never }, { relaxed: false });
  } catch {
    return String(storedId);
  }
}

/**
 * This function watches the change stream of the collection of a `MongoDocumentStorage`, and
 * publishes a hint of each change of an item on the topic of the collection procedures (roadmap
 * CLI-77). The writes that do not go through the procedures (a raw write, another process, a
 * script) then reach the subscribers too, and the storage adopts each raw write (D39). See the
 * module comment for the rules.
 *
 * - The storage of a partition (`forPartition()`) publishes only the documents of its partition.
 * - The watcher reads only the collection of the items. The documents of the counters
 *   (`__storage_counters`) are in another collection, and a change there is never a hint.
 * - An error of the publisher goes to the log. It never stops the watcher.
 * - The adoption of raw writes needs write access. A refused adoption goes to the log once, and
 *   the hint of that write goes out without a version: set `rawWrites: "ignore"` for a user that
 *   can only read.
 * - The adoption is exact only with `changeStreamPreAndPostImages` on the collection. Without the
 *   image, a raw update and a later write of the storage can give that write an extra version.
 *
 * @param storage - The storage, for its collection, its database and its stored form
 * @param publish - The function or the bus of the events, for example the bus of the procedures
 * @param options - The topic, the own writes, the raw writes, the gap, the backoff, the clock and the log
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
  // The subscribed topics of the bus name the partitions of a gap. A custom topic rule cannot be read back.
  const channels = typeof publish === "object" && typeof publish.channels === "function" && options.topic === undefined ? publish.channels.bind(publish) : undefined;
  const delayOf = backoffOf(options.backoff);
  if (options.ownWrites !== undefined && options.ownWrites !== "skip" && options.ownWrites !== "publish") throw new TypeError('ownWrites must be "skip" or "publish"');
  if (options.rawWrites !== undefined && options.rawWrites !== "adopt" && options.rawWrites !== "ignore") throw new TypeError('rawWrites must be "adopt" or "ignore"');
  const skipOwn = (options.ownWrites ?? "skip") === "skip";
  const adoptRaw = (options.rawWrites ?? "adopt") === "adopt";
  if (options.sweep !== undefined && typeof options.sweep !== "boolean") throw new TypeError("sweep must be a boolean");
  if (options.sweep === true && !adoptRaw) throw new TypeError('sweep needs rawWrites: "adopt"');
  const sweepOn = options.sweep ?? adoptRaw;

  let stopped = false;
  let stream: ChangeStream | undefined;
  let token: unknown;
  /** True after a stream was open: a new stream without a token can then miss changes. */
  let opened = false;
  let attempt = 0;
  let timer: Cancel | undefined;
  let own: OwnNumbers | undefined;
  /** True after the first refused adoption: the log tells it once. */
  let refused = false;
  /** True after the server said that it has change streams. */
  let checked = false;
  /** The raw writes that wait for an adoption, and true while one adoption runs. */
  const queue: AdoptJob[] = [];
  let adopting = false;
  /** True after the queue was full: the log tells it once, until the queue is empty. */
  let full = false;
  /** The timers of the adoptions that try again. */
  const retries = new Map<Cancel, AdoptJob>();
  /** True when a sweep must run at the next open of the stream, and true while one runs. */
  let sweepWanted = sweepOn;
  let sweeping = false;
  /** The partitions that got a hint: the topics of a gap. */
  const partitions = new Set<string | undefined>();
  let markReady: () => void = () => undefined;
  let failReady: (error: unknown) => void = () => undefined;
  const ready = new Promise<void>((resolve, reject) => {
    markReady = resolve;
    failReady = reject;
  });
  // A caller that does not wait for `ready` gets no unhandled rejection: the log tells the error
  ready.catch(() => undefined);

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

  /** The hint of a change of an item. A raw write that the storage does not adopt has no version. */
  const publishItem = (item: StorageChange): void => {
    if (stopped) return;
    if (partitions.size < MAX_GAP_PARTITIONS) partitions.add(item.partition);
    if (item.deleted) return send(item.partition, { changed: [], deleted: [item.id] });
    send(item.partition, item.version === undefined ? { changed: [item.id], deleted: [] } : { changed: [item.id], deleted: [], versions: [{ id: item.id, version: item.version }] });
  };

  /** The partitions of the subscribed topics of the bus and of `gapPartitions`. */
  const extraPartitions = (into: Set<string | undefined>): void => {
    try {
      for (const topic of channels?.() ?? []) {
        const parsed = collectionTopicPartition(topic);
        if (parsed?.collection === name) into.add(parsed.partition);
      }
    } catch (error) {
      log("warn", `the bus does not tell its channels: ${messageOf(error)}`);
    }
    try {
      for (const partition of options.gapPartitions?.() ?? []) into.add(partition);
    } catch (error) {
      log("warn", `gapPartitions failed: ${messageOf(error)}`);
    }
  };

  /** The hint of a gap: the subscribers read the changes. */
  const gap = (reason: string): void => {
    log("warn", `${reason}: the subscribers read the changes`);
    // The raw writes of the gap have no event: the sweep at the next open adopts them
    if (sweepOn) sweepWanted = true;
    if (source.partition !== undefined) return send(source.partition, { changed: [], deleted: [] });
    const topics = new Set<string | undefined>([undefined, ...partitions]);
    void source
      .partitions()
      .then(
        (known) => {
          for (const partition of known) topics.add(partition);
        },
        (error: unknown) => log("warn", `the counters of ${source.collection} cannot be read (${messageOf(error)}): the gap goes to the partitions of the hints and of the subscribers only`)
      )
      .then(() => {
        if (stopped) return;
        extraPartitions(topics);
        let count = 0;
        for (const partition of topics) {
          if (count++ >= MAX_GAP_PARTITIONS) break;
          send(partition, { changed: [], deleted: [] });
        }
      });
  };

  /** The end of one raw write of an adoption. The change event of an adoption is its hint. */
  const settle = (job: AdoptJob, result: RawAdoptionResult, failed: Map<string | undefined, unknown>): void => {
    if (typeof result === "string") {
      // `adopted`: the event of the adoption is the hint. `lost`: a newer write won, and its event is the hint.
      if (result === "unknown") {
        log("warn", `the raw write of ${describeId(job.raw.storedId)} in ${source.collection} tells neither its id nor its partition: the storage leaves it`);
        publishItem(job.item);
      }
      return job.done?.();
    }
    const error = result.error;
    if (isRefused(error)) {
      if (!refused) log("error", `the adoption of a raw write of ${source.collection} was refused (${messageOf(error)}): the watcher needs write access, or set rawWrites: "ignore". The hints of raw writes go out without a version`);
      refused = true;
      publishItem(job.item);
      return job.done?.();
    }
    if (isPermanent(error) || job.tries + 1 >= ADOPT_TRIES) {
      if (!failed.has(job.item.partition)) failed.set(job.item.partition, error);
      return job.done?.();
    }
    // An error that can go away: the adoption tries again after the backoff
    const retry = clock.after(delayOf(job.tries), () => {
      retries.delete(retry);
      enqueue({ ...job, tries: job.tries + 1 });
    });
    retry.unref?.();
    retries.set(retry, job);
  };

  /** One adoption at a time: the raw writes that wait together take one block of numbers for each storage. */
  const work = async (): Promise<void> => {
    adopting = true;
    try {
      while (!stopped && queue.length > 0) {
        const batch = queue.splice(0, ADOPT_BATCH);
        let results: RawAdoptionResult[];
        try {
          results = await source.adoptAll(batch.map((job) => job.raw));
        } catch (error) {
          results = batch.map(() => ({ error }));
        }
        if (stopped) {
          for (const job of batch) job.done?.();
          break;
        }
        const failed = new Map<string | undefined, unknown>();
        batch.forEach((job, index) => settle(job, results[index] ?? "unknown", failed));
        // The last try failed: a gap hint for each partition, so that its subscribers read the changes
        for (const [partition, error] of failed) {
          log("warn", `the adoption of the raw writes of the partition ${partition === undefined ? "(none)" : JSON.stringify(partition)} of ${source.collection} failed (${messageOf(error)}): its subscribers read the changes`);
          send(partition, { changed: [], deleted: [] });
        }
      }
      if (queue.length === 0) full = false;
    } finally {
      adopting = false;
    }
    if (stopped) for (const job of queue.splice(0)) job.done?.();
  };

  const enqueue = (job: AdoptJob): void => {
    if (stopped) return job.done?.();
    if (queue.length >= MAX_ADOPT_QUEUE) {
      if (!full) log("warn", `more than ${MAX_ADOPT_QUEUE} raw writes of ${source.collection} wait for an adoption: the next hints go out without a version`);
      full = true;
      publishItem(job.item);
      return job.done?.();
    }
    queue.push(job);
    if (!adopting) void work();
  };

  /** The adoption of a raw write (D39), through the queue. */
  const adopt = (item: StorageChange, change: Document, before: Document | undefined): void => {
    const after = change["operationType"] === "delete" ? undefined : asDocument(change["fullDocument"]);
    // A hard delete without the image before the change: the storage cannot write its tombstone
    if (!after && !before) return publishItem(item);
    const storedId = asDocument(change["documentKey"])?.["_id"];
    enqueue({ item, raw: { storedId, seq: item.seq, after, before }, tries: 0 });
  };

  /** The sweep: each document without `_seq` goes to the queue of the adoptions, one page at a time. */
  const sweep = async (): Promise<void> => {
    let last: { readonly id: unknown } | undefined;
    let count = 0;
    try {
      for (;;) {
        if (stopped) return;
        const page = await source.rawDocuments(last, SWEEP_PAGE);
        const end = page[page.length - 1];
        if (!end) break;
        last = { id: end["_id"] };
        const waits: Array<Promise<void>> = [];
        for (const doc of page) {
          let item: StorageChange | undefined;
          try {
            item = storageChangeOf({ operationType: "insert", fullDocument: doc, documentKey: { _id: doc["_id"] } }, source.form);
          } catch (error) {
            log("warn", `the sweep leaves ${describeId(doc["_id"])} of ${source.collection}: ${messageOf(error)}`);
            continue;
          }
          if (!item?.raw || (source.partition !== undefined && item.partition !== source.partition)) continue;
          count++;
          waits.push(new Promise<void>((resolve) => enqueue({ item, raw: { storedId: doc["_id"], seq: undefined, after: doc }, tries: 0, done: resolve })));
        }
        await Promise.all(waits);
        if (page.length < SWEEP_PAGE) break;
      }
      if (count > 0 && !stopped) log("info", `the sweep of ${source.collection} sent ${count} documents without _seq to the adoption`);
    } catch (error) {
      if (!stopped) log("warn", `the sweep of the documents without _seq of ${source.collection} failed: ${messageOf(error)}`);
    }
  };

  const startSweep = (): void => {
    if (!sweepWanted || sweeping || stopped) return;
    sweepWanted = false;
    sweeping = true;
    void sweep().finally(() => {
      sweeping = false;
      startSweep();
    });
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
    if (source.partition !== undefined && item.partition !== source.partition) return;
    if (!item.raw) {
      // The event of a write of this process: the collection procedures publish it
      if (skipOwn && own && item.seq !== undefined && own.take(item.seq)) return;
      return publishItem(item);
    }
    const before = asDocument(change["fullDocumentBeforeChange"]);
    // The delete of a tombstone that this process pruned: no item. With the image, storageChangeOf() tells it.
    if (type === "delete" && !before && own?.takePruned(asDocument(change["documentKey"])?.["_id"])) return;
    if (!adoptRaw) return publishItem(item);
    adopt(item, change, before);
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

  /** The end of the adoptions that wait: a stopped watcher adopts nothing. */
  const endAdoptions = (): void => {
    for (const [retry, job] of retries) {
      retry();
      job.done?.();
    }
    retries.clear();
    for (const job of queue.splice(0)) job.done?.();
  };

  /** The end of a watcher whose first open failed with an error that does not go away. */
  const fail = (error: unknown): void => {
    log("error", `the stream of ${source.collection} cannot open (${messageOf(error)}): the watcher stops`);
    stopped = true;
    endAdoptions();
    own?.close();
    own = undefined;
    failReady(error);
  };

  const open = async (): Promise<void> => {
    if (stopped) return;
    let db: Db;
    try {
      db = await source.db();
    } catch (error) {
      if (!opened && isPermanent(error)) return fail(error);
      return schedule(`the database is not available (${messageOf(error)})`);
    }
    if (stopped) return;
    if (!checked) {
      // On a single server, the driver can wait without an error: the watcher asks the server first
      let hello: Document | undefined;
      try {
        hello = await db.command({ hello: 1 });
      } catch (error) {
        // An old server without hello: the stream tells the error
        if (codeOf(error) !== COMMAND_NOT_FOUND) {
          if (!opened && isPermanent(error)) return fail(error);
          return schedule(`the server does not answer hello (${messageOf(error)})`);
        }
      }
      if (stopped) return;
      if (hello && typeof hello["setName"] !== "string" && hello["msg"] !== "isdbgrid") {
        return fail(Object.assign(new Error("change streams need a replica set or a sharded cluster, and the server is a single server"), { code: 40573 }));
      }
      checked = true;
    }
    own ??= trackOwnNumbers(db, source.collection, { numbers: skipOwn, clock });
    if (token === undefined && opened) gap(`the stream of ${source.collection} opens again without a resume token`);
    let next: ChangeStream;
    try {
      next = db.collection(source.collection).watch([], {
        fullDocument: "updateLookup",
        fullDocumentBeforeChange: "whenAvailable",
        ...(token !== undefined && { startAfter: token }),
      });
    } catch (error) {
      if (!opened && isPermanent(error)) return fail(error);
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
      if (!opened && error !== undefined && isPermanent(error)) return fail(error);
      const code = codeOf(error);
      if (code !== undefined && LOST_TOKEN_CODES.has(code) && token !== undefined) {
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
      startSweep();
    });
    next.on("change", (change: Document) => {
      opened = true;
      markReady();
      startSweep();
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
      endAdoptions();
      own?.close();
      own = undefined;
      markReady();
      const current = stream;
      stream = undefined;
      await current?.close().catch(() => undefined);
    },
  };
}
