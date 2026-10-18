/**
 * `MongoDocumentStorage`: a `CollectionStorage` over MongoDB with flat documents, a change log,
 * versions, queries in the database and partitions (roadmap CLI-24). `MongoStorage` keeps its
 * `{ _id, data }` documents.
 *
 * The documents:
 * - An item that is a plain object with safe keys is stored flat: its fields beside the fields of
 *   the storage. Another item (null, a primitive, an array, or an object with a key of the storage,
 *   a key that starts with `$` or a key with a dot) is stored as JSON text in `_json`. Both ways
 *   give the item back as it was.
 * - An item whose `_id` is its id keeps it: the storage gives it back.
 * - The fields of the storage: `_key` (the id), `_part` (the partition), `_seq` (the sequence
 *   number of the last write), `_ord` (the number of the first write: the order of the entries, as
 *   a `Map` keeps it) and `_tomb` (a deleted item).
 * - With a partition, the stored `_id` is `<partition>` + U+001F + `<id>`. An id cannot have the
 *   character U+001F. Each partition reads and writes only its documents: each write filter has the
 *   partition too, so a write of a stored `_id` of another partition fails and changes nothing.
 *
 * The change log:
 * - Each write gets the next number of the sequence of the collection. `_seq` is also the version
 *   of the item (`versionOf`).
 * - A delete leaves a tombstone, so `getChangesSince` gives the exact deletes. The storage keeps at
 *   most `maxTombstones` tombstones in each partition. A version before the oldest dropped
 *   tombstone gives a full result.
 * - A version names the epoch of the sequence. A version of another epoch gives a full result.
 * - The log stays exact when several processes write. On a replica set (or a sharded cluster), a
 *   write takes its numbers and writes in one transaction, so the numbers become visible in their
 *   order. On a single server, a watermark does it: each write keeps its numbers pending in the
 *   counter document until it ends, and a version stops below the lowest pending number. A
 *   pending number of a writer that stopped expires after `writeLease`. A write that ends after
 *   its lease moves its documents to new numbers, so a reader that passed the old numbers gets
 *   it. One case stays on a single server: a process that stops between such a late write and the
 *   move of its documents. Then a reader that passed the old numbers does not get that change.
 *
 * The queries: `query()` sends the conditions that MongoDB tests in the same way (the equality of
 * a string, a number or a boolean, and `$in` of them) as a filter. `queryEntries()` of the core
 * then gives the exact result, so a query always gives the result of the reference.
 *
 * The aggregations: `aggregate()` runs a read-only pipeline on the items of the partition, with
 * the guard of `scopePipeline()` and the limits of time and size.
 */

import { randomUUID } from "node:crypto";
import type { AnyBulkWriteOperation, ClientSession, Collection, Db, Document, Filter, MongoClient } from "mongodb";
import {
  applyPatch,
  queryEntries,
  type CollectionStorage,
  type StorageChanges,
  type StorageMetadata,
  type StoragePatch,
  type StorageQueryOptions,
  type StorageQueryPolicy,
  type StorageSelector,
  type StorageWriteOptions,
} from "@procedures/collections";
import { optionalMs, toMs, type Duration } from "@procedures/client";
import { ensureConnection } from "../connection.js";
import { boundPipeline, cutResults, DEFAULT_PIPELINE_LIMITS, scopePipeline, type PipelineLimits } from "./pipeline-scope.js";

/** The fields of the storage in a stored document. */
const KEY = "_key";
const PART = "_part";
const SEQ = "_seq";
/** The number of the first write of an item since its last delete: the order of the entries. */
const ORD = "_ord";
const TOMB = "_tomb";
const JSON_FIELD = "_json";
/** True in a stored document whose item had `_id` equal to its id. */
const KEEP_ID = "_kid";
const STORAGE_FIELDS: ReadonlySet<string> = new Set(["_id", KEY, PART, SEQ, ORD, TOMB, JSON_FIELD, KEEP_ID]);
/** The separator of the partition and the id in a stored `_id`. */
export const SEPARATOR = "\u001f";

/** The options of a `MongoDocumentStorage`. */
export interface MongoDocumentStorageOptions {
  /** The MongoDB collection. */
  collection: string;
  /** The database. The default is the database of the default connection, for each operation. */
  db?: (() => Db | Promise<Db>) | undefined;
  /** The partition of the storage. Without it, the storage reads and writes the documents without a partition. */
  partition?: string | undefined;
  /** The most tombstones of a partition (default 10000). */
  maxTombstones?: number | undefined;
  /** The query policy of `query()` without a policy of the call. */
  queryPolicy?: StorageQueryPolicy | undefined;
  /** The collection of the sequence counters (default `__storage_counters`). */
  counters?: string | undefined;
  /**
   * The time after which a pending number of a write no longer holds the watermark (default 60 s):
   * a writer that stopped does not stop the change reads. A plain number is a `TypeError`.
   */
  writeLease?: Duration | undefined;
  /**
   * The client of the database, for the transactions. The default is the client of the default
   * connection when `db` is absent. Without a client, the writes use the watermark.
   */
  client?: (() => MongoClient | Promise<MongoClient>) | undefined;
  /**
   * `auto` (the default): a write is a transaction on a replica set or a sharded cluster, and uses
   * the watermark on a single server. `never`: each write uses the watermark.
   */
  transactions?: "auto" | "never" | undefined;
}

/** A stored document. */
type Stored = Document & { _id: string };

/** A range of numbers that a write took and has not written yet. */
interface PendingRange {
  from: number;
  to: number;
  /** The time of the server when the write took the numbers. */
  at: Date;
}

/** A document of the counters: the sequence of a collection, or the floor of the log of a partition. */
interface CounterDoc {
  _id: string;
  seq?: number;
  epoch?: string;
  floor?: number;
  pending?: PendingRange[];
}

/** True when a database is on a replica set or a sharded cluster: it has transactions. */
const TRANSACTIONAL = new WeakMap<Db, Promise<boolean>>();

function hasTransactions(db: Db): Promise<boolean> {
  let known = TRANSACTIONAL.get(db);
  if (!known) {
    known = db
      .admin()
      .command({ hello: 1 })
      .then((hello) => typeof hello["setName"] === "string" || hello["msg"] === "isdbgrid")
      .catch(() => false);
    TRANSACTIONAL.set(db, known);
  }
  return known;
}

/** The most moves of a late write to new numbers. */
const MAX_MOVES = 10;

/** The writes and the change reads of each collection of each database, one at a time. */
const QUEUES = new WeakMap<Db, Map<string, Promise<unknown>>>();

function enqueue<R>(db: Db, collection: string, task: () => Promise<R>): Promise<R> {
  let queues = QUEUES.get(db);
  if (!queues) QUEUES.set(db, (queues = new Map()));
  const before = queues.get(collection) ?? Promise.resolve();
  const run = before.then(task, task);
  const settled = run.then(
    () => undefined,
    () => undefined
  );
  queues.set(collection, settled);
  void settled.then(() => {
    if (queues.get(collection) === settled) queues.delete(collection);
  });
  return run;
}

/** True for a plain object whose keys a flat document can keep, at each depth. */
function isFlatSafe(value: unknown, top: boolean): boolean {
  if (Array.isArray(value)) return value.every((element) => isFlatSafe(element, false));
  if (typeof value !== "object" || value === null) return true;
  const proto = Object.getPrototypeOf(value) as unknown;
  if (proto !== Object.prototype && proto !== null) return value instanceof Date;
  for (const [key, field] of Object.entries(value)) {
    if (key.startsWith("$") || key.includes(".") || key === "__proto__") return false;
    if (top && STORAGE_FIELDS.has(key) && key !== "_id") return false;
    if (!isFlatSafe(field, false)) return false;
  }
  return true;
}

/** True for a plain object. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/** This function sets an own field (a key `__proto__` does not change the prototype). */
function put(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

/** The value of a scalar condition that MongoDB tests in the same way as the core. */
function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
}

/** The field of a stored document for a path of a selector, or undefined when the filter cannot test it. */
function storedPath(path: string): string | undefined {
  if (path === "_id") return KEY;
  const first = path.split(".")[0]!;
  if (first === "_id" || STORAGE_FIELDS.has(first)) return undefined;
  return path;
}

/** The filter of one condition, or undefined when the filter cannot test it in the same way. */
function conditionFilter(path: string, condition: unknown): Document | undefined {
  const field = storedPath(path);
  if (field === undefined) return undefined;
  if (isScalar(condition)) return { [field]: condition };
  if (!isPlainObject(condition)) return undefined;
  const operators: Document = {};
  const eq = condition["$eq"];
  if (isScalar(eq)) operators["$eq"] = eq;
  const among = condition["$in"];
  if (Array.isArray(among) && among.length > 0 && among.every(isScalar)) operators["$in"] = among;
  return Object.keys(operators).length > 0 ? { [field]: operators } : undefined;
}

/**
 * This function gives a filter that each item of the selector passes (a filter can pass more),
 * or undefined for no condition. Only conditions that MongoDB tests in the same way go in it.
 */
export function selectorPrefilter(selector: StorageSelector): Document | undefined {
  const parts: Document[] = [];
  for (const [key, condition] of Object.entries(selector as Record<string, unknown>)) {
    if (condition === undefined) continue;
    if (key === "$and" && Array.isArray(condition)) {
      for (const branch of condition) {
        const filter = isPlainObject(branch) ? selectorPrefilter(branch as StorageSelector) : undefined;
        if (filter) parts.push(filter);
      }
    } else if (key === "$or" && Array.isArray(condition) && condition.length > 0) {
      const branches = condition.map((branch) => (isPlainObject(branch) ? selectorPrefilter(branch as StorageSelector) : undefined));
      // A branch without a condition passes each item: then the $or tests nothing
      if (branches.every((branch): branch is Document => branch !== undefined)) parts.push({ $or: branches });
    } else if (!key.startsWith("$")) {
      const filter = conditionFilter(key, condition);
      if (filter) parts.push(filter);
    }
  }
  if (parts.length === 0) return undefined;
  return parts.length === 1 ? parts[0] : { $and: parts };
}

/** The sequence counter of a collection. */
interface Counter {
  seq: number;
  epoch: string;
}

/**
 * A `CollectionStorage` over MongoDB with flat documents, a change log, versions, queries in the
 * database and partitions (roadmap CLI-24).
 *
 * @example
 * ```typescript
 * const notes = new MongoDocumentStorage<Note>({ collection: "notes" });
 * server.usePartitions("notes", { storageOf: (partition) => notes.forPartition(partition), resolve });
 * ```
 */
export class MongoDocumentStorage<T> implements CollectionStorage<T> {
  private readonly options: MongoDocumentStorageOptions;
  private readonly collectionName: string;
  private readonly partition: string | undefined;
  private readonly maxTombstones: number;
  private readonly countersName: string;
  private readonly writeLeaseMs: number;
  /** The storages of the partitions, for `forPartition`: the same storage for the same partition. */
  private readonly partitions: Map<string, MongoDocumentStorage<T>>;
  private indexes: Promise<void> | undefined;
  private closed = false;

  constructor(options: MongoDocumentStorageOptions, partitions?: Map<string, MongoDocumentStorage<T>>) {
    if (options.partition !== undefined && (options.partition === "" || options.partition.includes(SEPARATOR))) {
      throw new Error("A partition must be a text without the character U+001F");
    }
    this.options = options;
    this.collectionName = options.collection;
    this.partition = options.partition;
    this.maxTombstones = options.maxTombstones ?? 10_000;
    if (!Number.isSafeInteger(this.maxTombstones) || this.maxTombstones < 0) throw new Error("maxTombstones must be a whole number of 0 or more");
    this.countersName = options.counters ?? "__storage_counters";
    this.writeLeaseMs = Math.round(optionalMs(options.writeLease, "writeLease") ?? 60_000);
    if (!Number.isSafeInteger(this.writeLeaseMs) || this.writeLeaseMs < 1) throw new Error("writeLease must be 1 ms or more");
    this.partitions = partitions ?? new Map();
  }

  /** The storage of a partition of the same collection. It gives the same storage for the same partition. */
  forPartition(partition: string): MongoDocumentStorage<T> {
    let storage = this.partitions.get(partition);
    if (!storage) {
      storage = new MongoDocumentStorage<T>({ ...this.options, partition }, this.partitions);
      this.partitions.set(partition, storage);
    }
    return storage;
  }

  // ===========================================================================
  // The database
  // ===========================================================================

  private async database(): Promise<Db> {
    this.checkOpen();
    return this.options.db ? await this.options.db() : (await ensureConnection()).getDb();
  }

  private async collection(): Promise<{ db: Db; items: Collection<Stored> }> {
    const db = await this.database();
    const items = db.collection<Stored>(this.collectionName);
    this.indexes ??= items
      .createIndexes([{ key: { [PART]: 1, [SEQ]: 1 } }, { key: { [PART]: 1, [ORD]: 1 } }, { key: { [PART]: 1, [TOMB]: 1 } }])
      .then(() => undefined)
      .catch((error: unknown) => {
        this.indexes = undefined;
        throw error;
      });
    await this.indexes;
    return { db, items };
  }

  /** The filter of the documents of the partition. */
  private partitionFilter(): Document {
    return this.partition === undefined ? { [PART]: { $exists: false } } : { [PART]: this.partition };
  }

  /** The filter of the items (not the tombstones) of the partition. */
  private liveFilter(extra?: Document): Filter<Stored> {
    return { ...this.partitionFilter(), [TOMB]: { $ne: true }, ...extra } as Filter<Stored>;
  }

  /** The stored `_id` of an id. An id with the separator could name an item of a partition: it is refused. */
  private storedId(id: string): string {
    if (typeof id !== "string" || id.includes(SEPARATOR)) throw new Error("An id must be a text without the character U+001F");
    return this.partition === undefined ? id : `${this.partition}${SEPARATOR}${id}`;
  }

  /** The filter of a write of one stored document: its `_id` and the partition. */
  private writeFilter(id: string): Filter<Stored> {
    return { _id: this.storedId(id), ...this.partitionFilter() } as Filter<Stored>;
  }

  /** The stored document of an item, with the number of this write and the number of its place. */
  private encode(id: string, value: T, seq: number, ord: number): Stored {
    const doc: Stored = { _id: this.storedId(id), [KEY]: id, [SEQ]: seq, [ORD]: ord };
    if (this.partition !== undefined) doc[PART] = this.partition;
    const keepsId = isPlainObject(value) && value["_id"] === id;
    if (isPlainObject(value) && isFlatSafe(value, true) && (!("_id" in value) || keepsId)) {
      if (keepsId) doc[KEEP_ID] = true;
      for (const [key, field] of Object.entries(value)) if (key !== "_id") put(doc, key, field);
    } else {
      doc[JSON_FIELD] = JSON.stringify(value);
    }
    return doc;
  }

  /** The id and the item of a stored document. */
  private decode(doc: Document): [string, T] {
    const id = String(doc[KEY]);
    if (typeof doc[JSON_FIELD] === "string") return [id, JSON.parse(doc[JSON_FIELD]) as T];
    const value: Record<string, unknown> = {};
    if (doc[KEEP_ID] === true) value["_id"] = id;
    for (const [key, field] of Object.entries(doc)) if (!STORAGE_FIELDS.has(key)) put(value, key, field);
    return [id, value as T];
  }

  /**
   * The next `count` numbers of the sequence of the collection. They stay pending in the counter
   * document until `release()`, so the watermark of the readers stays below them.
   */
  private async allocate(db: Db, count: number): Promise<{ first: number; epoch: string }> {
    const counter = (await db.collection<CounterDoc>(this.countersName).findOneAndUpdate(
      { _id: this.collectionName },
      [
        { $set: { seq: { $add: [{ $ifNull: ["$seq", 0] }, count] }, epoch: { $ifNull: ["$epoch", randomUUID()] } } },
        {
          $set: {
            pending: {
              $concatArrays: [{ $ifNull: ["$pending", []] }, [{ from: { $subtract: ["$seq", count - 1] }, to: "$seq", at: "$$NOW" }]],
            },
          },
        },
      ],
      { upsert: true, returnDocument: "after" }
    )) as unknown as Counter | null;
    if (!counter) throw new Error(`The sequence of ${this.collectionName} is not available`);
    return { first: counter.seq - count + 1, epoch: counter.epoch };
  }

  /**
   * This method ends the pending numbers of a write, and drops the pending numbers whose lease
   * ended. In the same atomic step, the server tells if the numbers were still in their lease: the
   * time since `at` only grows, so a range in its lease at the end was in its lease for the whole
   * write, and no reader passed its numbers.
   */
  private async release(db: Db, first: number): Promise<boolean> {
    const live = { $gt: ["$$this.at", { $subtract: ["$$NOW", this.writeLeaseMs] }] };
    const after = (await db.collection<CounterDoc>(this.countersName).findOneAndUpdate(
      { _id: this.collectionName },
      [
        {
          $set: {
            lastRelease: {
              from: first,
              inLease: {
                $anyElementTrue: [
                  { $map: { input: { $filter: { input: { $ifNull: ["$pending", []] }, cond: { $eq: ["$$this.from", first] } } }, in: live } },
                ],
              },
            },
            pending: { $filter: { input: { $ifNull: ["$pending", []] }, cond: { $and: [{ $ne: ["$$this.from", first] }, live] } } },
          },
        },
      ],
      { returnDocument: "after", projection: { lastRelease: 1 } }
    )) as { lastRelease?: { from?: number; inLease?: boolean } } | null;
    return after?.lastRelease?.from === first && after.lastRelease.inLease === true;
  }

  /** This method moves the documents of a late write from its numbers to new numbers. */
  private async move(collection: Collection<Stored>, first: number, count: number, next: number): Promise<void> {
    const shift = next - first;
    await collection.updateMany({ ...this.partitionFilter(), [SEQ]: { $gte: first, $lte: first + count - 1 } } as Filter<Stored>, [
      {
        $set: {
          // A new item keeps its place at its first number: the place moves with it
          [ORD]: { $cond: [{ $eq: [`$${ORD}`, `$${SEQ}`] }, { $add: [`$${SEQ}`, shift] }, `$${ORD}`] },
          [SEQ]: { $add: [`$${SEQ}`, shift] },
        },
      },
    ]);
  }

  /** The client for the transactions of the writes, or undefined for the watermark. */
  private async transactionClient(db: Db): Promise<MongoClient | undefined> {
    if (this.options.transactions === "never") return undefined;
    const client = this.options.client ? await this.options.client() : this.options.db ? undefined : (await ensureConnection()).getClient();
    return client && (await hasTransactions(db)) ? client : undefined;
  }

  /**
   * This method takes numbers and writes with them. On a replica set, the two are one
   * transaction. Else the numbers stay pending until the write ends, and a late write moves its
   * documents to new numbers.
   */
  private async withNumbers<R>(db: Db, collection: Collection<Stored>, count: number, write: (first: number, session?: ClientSession) => Promise<R>): Promise<R> {
    const client = await this.transactionClient(db);
    if (client) {
      const session = client.startSession();
      try {
        return await session.withTransaction(async () => {
          const counter = (await db.collection<CounterDoc>(this.countersName).findOneAndUpdate(
            { _id: this.collectionName },
            { $inc: { seq: count }, $setOnInsert: { epoch: randomUUID() } },
            { upsert: true, returnDocument: "after", session }
          )) as unknown as Counter | null;
          if (!counter) throw new Error(`The sequence of ${this.collectionName} is not available`);
          return write(counter.seq - count + 1, session);
        });
      } finally {
        await session.endSession();
      }
    }
    let { first } = await this.allocate(db, count);
    let result: R;
    try {
      result = await write(first);
    } catch (error) {
      await this.release(db, first).catch(() => undefined);
      throw error;
    }
    for (let moves = 0; !(await this.release(db, first)); moves++) {
      if (moves >= MAX_MOVES) throw new Error(`A write of ${this.collectionName} stayed late after ${MAX_MOVES} moves to new numbers`);
      // Late: a reader can have passed these numbers. The write takes new ones.
      const next = (await this.allocate(db, count)).first;
      await this.move(collection, first, count, next);
      first = next;
    }
    return result;
  }

  /**
   * The watermark of the collection: the highest number below each pending number of a write whose
   * lease has not ended, and the epoch. Each number up to it is written or abandoned.
   */
  private async watermark(db: Db): Promise<Counter> {
    const counters = db.collection<CounterDoc>(this.countersName);
    await counters.updateOne({ _id: this.collectionName }, { $setOnInsert: { seq: 0, epoch: randomUUID() } }, { upsert: true });
    const [mark] = await counters
      .aggregate<{ seq: number; epoch: string; low: number | null }>([
        { $match: { _id: this.collectionName } },
        {
          $project: {
            seq: 1,
            epoch: 1,
            low: {
              $min: {
                $map: {
                  input: {
                    $filter: { input: { $ifNull: ["$pending", []] }, cond: { $gt: ["$$this.at", { $subtract: ["$$NOW", this.writeLeaseMs] }] } },
                  },
                  in: "$$this.from",
                },
              },
            },
          },
        },
      ])
      .toArray();
    if (!mark) throw new Error(`The sequence of ${this.collectionName} is not available`);
    const seq = typeof mark.low === "number" ? Math.min(mark.seq, mark.low - 1) : mark.seq;
    return { seq, epoch: mark.epoch };
  }

  /** The id of the document of the oldest kept change of the partition. */
  private floorId(): string {
    return `floor${SEPARATOR}${this.collectionName}${SEPARATOR}${this.partition ?? ""}`;
  }

  /** This method drops the oldest tombstones of the partition over the limit, and keeps the floor of the log. */
  private async pruneTombstones(db: Db, items: Collection<Stored>): Promise<void> {
    const count = await items.countDocuments({ ...this.partitionFilter(), [TOMB]: true } as Filter<Stored>);
    const excess = count - this.maxTombstones;
    if (excess <= 0) return;
    const oldest = await items
      .find({ ...this.partitionFilter(), [TOMB]: true } as Filter<Stored>, { projection: { _id: 1, [SEQ]: 1 } })
      .sort({ [SEQ]: 1 })
      .limit(excess)
      .toArray();
    if (oldest.length === 0) return;
    await items.deleteMany({ _id: { $in: oldest.map((doc) => doc._id) } } as Filter<Stored>);
    const floor = Math.max(...oldest.map((doc) => Number(doc[SEQ])));
    await db.collection<CounterDoc>(this.countersName).updateOne({ _id: this.floorId() }, { $max: { floor } }, { upsert: true });
  }

  /** The items of the partition, in the order of the entries. */
  private async liveDocs(extra?: Document): Promise<Document[]> {
    const { items } = await this.collection();
    return items.find(this.liveFilter(extra)).sort({ [ORD]: 1 }).toArray();
  }

  /** The places (`_ord`) of the items of some ids that the partition has. */
  private async placesOf(collection: Collection<Stored>, ids: readonly string[]): Promise<Map<string, number>> {
    const docs = await collection
      .find(this.liveFilter({ _id: { $in: [...new Set(ids)].map((id) => this.storedId(id)) } }), { projection: { [KEY]: 1, [ORD]: 1 } })
      .toArray();
    return new Map(docs.map((doc) => [String(doc[KEY]), Number(doc[ORD])]));
  }

  // ===========================================================================
  // Reads
  // ===========================================================================

  async get(id: string): Promise<T | undefined> {
    const { items } = await this.collection();
    const doc = await items.findOne(this.liveFilter({ _id: this.storedId(id) }));
    return doc ? this.decode(doc)[1] : undefined;
  }

  async getAll(): Promise<T[]> {
    return (await this.liveDocs()).map((doc) => this.decode(doc)[1]);
  }

  async getEntries(): Promise<Array<[string, T]>> {
    return (await this.liveDocs()).map((doc) => this.decode(doc));
  }

  async getIds(): Promise<string[]> {
    const { items } = await this.collection();
    const docs = await items.find(this.liveFilter(), { projection: { [KEY]: 1 } }).sort({ [ORD]: 1 }).toArray();
    return docs.map((doc) => String(doc[KEY]));
  }

  async find(predicate: (item: T) => boolean): Promise<T[]> {
    return (await this.getAll()).filter(predicate);
  }

  async query(selector: StorageSelector, options?: StorageQueryOptions, policy?: StorageQueryPolicy): Promise<Array<[string, T]>> {
    const rule = policy ?? this.options.queryPolicy;
    // The reference checks the selector and the options first, without a read of the database
    queryEntries([], selector, options, rule);
    const filter = selectorPrefilter(selector);
    const docs = await this.liveDocs(filter ? { $or: [{ [JSON_FIELD]: { $exists: true } }, filter] } : undefined);
    return queryEntries(docs.map((doc) => this.decode(doc)), selector, options, rule) as Array<[string, T]>;
  }

  async has(id: string): Promise<boolean> {
    const { items } = await this.collection();
    return (await items.countDocuments(this.liveFilter({ _id: this.storedId(id) }), { limit: 1 })) > 0;
  }

  async size(): Promise<number> {
    const { items } = await this.collection();
    return items.countDocuments(this.liveFilter());
  }

  async getBatch(ids: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>();
    if (ids.length === 0) {
      this.checkOpen();
      return result;
    }
    const { items } = await this.collection();
    const docs = await items.find(this.liveFilter({ _id: { $in: ids.map((id) => this.storedId(id)) } })).toArray();
    const byId = new Map(docs.map((doc) => this.decode(doc)));
    // The order of the ids of the call
    for (const id of ids) if (byId.has(id)) result.set(id, byId.get(id)!);
    return result;
  }

  /**
   * This method runs a read-only aggregation pipeline on the items of the partition. The filter of
   * the partition goes on each read of the pipeline, also in its sub-pipelines (`scopePipeline`),
   * and the tombstones stay out. `$out`, `$merge`, the stages of the server and the JavaScript
   * operators are refused. The pipeline reads the stored documents: an item stored flat has the
   * fields of the storage beside its fields, and an item stored as JSON has only `_json`.
   */
  async aggregate(pipeline: readonly Document[], limits: PipelineLimits = {}): Promise<{ docs: Document[]; truncated: boolean }> {
    const maxResults = limits.maxResults ?? DEFAULT_PIPELINE_LIMITS.maxResults;
    const maxTimeMS = Math.round(toMs(limits.maxTime ?? DEFAULT_PIPELINE_LIMITS.maxTime, "maxTime"));
    if (!Number.isSafeInteger(maxResults) || maxResults < 1) throw new Error("maxResults must be a whole number of 1 or more");
    if (!Number.isSafeInteger(maxTimeMS) || maxTimeMS < 1) throw new Error("maxTime must be 1 ms or more");
    // The pipeline reads only this collection: another collection needs its own right
    const scopedPipeline = scopePipeline(pipeline, { match: { ...this.partitionFilter(), [TOMB]: { $ne: true } }, collections: [this.collectionName] });
    const bounded = boundPipeline(scopedPipeline, maxResults);
    const { items } = await this.collection();
    const results = await items.aggregate(bounded.pipeline, { maxTimeMS }).toArray();
    return cutResults(results, maxResults, bounded.limited);
  }

  /** The version of an item: the sequence number of its last write, or undefined for a missing id. */
  async versionOf(id: string): Promise<string | undefined> {
    const { items } = await this.collection();
    const doc = await items.findOne(this.liveFilter({ _id: this.storedId(id) }), { projection: { [SEQ]: 1 } });
    return doc ? String(doc[SEQ]) : undefined;
  }

  async getChangesSince(since?: string): Promise<StorageChanges<T>> {
    const { db, items } = await this.collection();
    return enqueue(db, this.collectionName, async () => {
      const counter = await this.watermark(db);
      const version = `${counter.epoch}.${counter.seq}`;
      const full = async (): Promise<StorageChanges<T>> => ({
        version,
        full: true,
        changed: (await items.find(this.liveFilter()).sort({ [ORD]: 1 }).toArray()).map((doc) => this.decode(doc)),
        deleted: [],
      });
      const match = since === undefined ? null : /^([^.]+)\.(\d+)$/.exec(since);
      if (!match || match[1] !== counter.epoch) return full();
      const from = Number(match[2]);
      const floorDoc = await db.collection<CounterDoc>(this.countersName).findOne({ _id: this.floorId() });
      const floor = typeof floorDoc?.["floor"] === "number" ? floorDoc["floor"] : 0;
      if (from < floor || from > counter.seq) return full();
      // A number above the watermark can belong to a write that is not visible yet: the next read gives it
      const docs = await items
        .find({ ...this.partitionFilter(), [SEQ]: { $gt: from, $lte: counter.seq } } as Filter<Stored>)
        .sort({ [SEQ]: 1 })
        .toArray();
      const changed: Array<[string, T]> = [];
      const deleted: string[] = [];
      for (const doc of docs) {
        if (doc[TOMB] === true) deleted.push(String(doc[KEY]));
        else changed.push(this.decode(doc));
      }
      return { version, full: false, changed, deleted };
    });
  }

  // ===========================================================================
  // Writes
  // ===========================================================================

  private async write<R>(task: (db: Db, items: Collection<Stored>) => Promise<R>): Promise<R> {
    const { db, items } = await this.collection();
    return enqueue(db, this.collectionName, () => task(db, items));
  }

  async set(id: string, value: T, _options?: StorageWriteOptions): Promise<void> {
    await this.setBatch([[id, value]]);
  }

  async setBatch(items: Array<[string, T]>, _options?: StorageWriteOptions): Promise<void> {
    if (items.length === 0) {
      this.checkOpen();
      return;
    }
    // The ids and the encoding are checked before a number of the sequence goes
    for (const [id, value] of items) {
      this.storedId(id);
      JSON.stringify(value);
    }
    await this.write(async (db, collection) => {
      const places = await this.placesOf(collection, items.map(([id]) => id));
      await this.withNumbers(db, collection, items.length, async (first, session) => {
        const placed = new Map(places);
        const operations: AnyBulkWriteOperation<Stored>[] = items.map(([id, value], index) => {
          const seq = first + index;
          // A new id takes its place at its first write; a later write of the batch keeps it
          if (!placed.has(id)) placed.set(id, seq);
          return { replaceOne: { filter: this.writeFilter(id), replacement: this.encode(id, value, seq, placed.get(id)!), upsert: true } };
        });
        await collection.bulkWrite(operations, { ordered: true, ...(session ? { session } : {}) });
      });
    });
  }

  async patch(id: string, fields: StoragePatch, _options?: StorageWriteOptions): Promise<T | undefined> {
    return this.write(async (db, collection) => {
      const doc = await collection.findOne(this.liveFilter({ _id: this.storedId(id) }));
      if (!doc) return undefined;
      const next = applyPatch(this.decode(doc)[1], fields) as T;
      await this.withNumbers(db, collection, 1, (first, session) =>
        collection.replaceOne(this.writeFilter(id), this.encode(id, next, first, Number(doc[ORD])), { upsert: true, ...(session ? { session } : {}) })
      );
      return next;
    });
  }

  async delete(id: string, options?: StorageWriteOptions): Promise<boolean> {
    return (await this.deleteBatch([id], options)) > 0;
  }

  async deleteBatch(ids: string[], _options?: StorageWriteOptions): Promise<number> {
    if (ids.length === 0) {
      this.checkOpen();
      return 0;
    }
    return this.write(async (db, collection) => {
      const unique = [...new Set(ids)];
      const live = await collection
        .find(this.liveFilter({ _id: { $in: unique.map((id) => this.storedId(id)) } }), { projection: { _id: 1, [KEY]: 1 } })
        .toArray();
      if (live.length === 0) return 0;
      const liveIds = new Set(live.map((doc) => String(doc[KEY])));
      const deleted = unique.filter((id) => liveIds.has(id));
      await this.tombstone(db, collection, deleted);
      return deleted.length;
    });
  }

  async clear(_options?: StorageWriteOptions): Promise<void> {
    await this.write(async (db, collection) => {
      const live = await collection.find(this.liveFilter(), { projection: { [KEY]: 1 } }).sort({ [ORD]: 1 }).toArray();
      if (live.length === 0) return;
      await this.tombstone(
        db,
        collection,
        live.map((doc) => String(doc[KEY]))
      );
    });
  }

  /** This method replaces the items of the ids with tombstones, with new numbers, in the queue of the collection. */
  private async tombstone(db: Db, collection: Collection<Stored>, ids: string[]): Promise<void> {
    await this.withNumbers(db, collection, ids.length, async (first, session) => {
      const operations: AnyBulkWriteOperation<Stored>[] = ids.map((id, index) => {
        const tomb: Stored = { _id: this.storedId(id), [KEY]: id, [SEQ]: first + index, [TOMB]: true };
        if (this.partition !== undefined) tomb[PART] = this.partition;
        return { replaceOne: { filter: this.writeFilter(id), replacement: tomb } };
      });
      await collection.bulkWrite(operations, { ordered: true, ...(session ? { session } : {}) });
    });
    await this.pruneTombstones(db, collection);
  }

  // ===========================================================================
  // The life of the storage
  // ===========================================================================

  /**
   * This method closes the storage. The connection belongs to the package or to the caller, so it
   * stays open. After `close()`, each operation rejects, and a second `close()` does nothing.
   */
  async close(): Promise<void> {
    this.closed = true;
  }

  private checkOpen(): void {
    if (this.closed) throw new Error(`The MongoDocumentStorage of the collection ${this.collectionName} is closed`);
  }

  async getMetadata(): Promise<StorageMetadata> {
    return {
      type: "custom",
      size: await this.size(),
      stats: { collectionName: this.collectionName, ...(this.partition !== undefined ? { partition: this.partition } : {}) },
    };
  }
}
