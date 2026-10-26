/**
 * `MongoDocumentStorage`: a `CollectionStorage` over MongoDB with flat documents, a change log,
 * versions, queries in the database and partitions (roadmap CLI-24). `MongoStorage` keeps its
 * `{ _id, data }` documents.
 *
 * The documents:
 * - An item that is a plain object is stored flat: its fields beside the fields of the storage. A
 *   key with `$` or a dot below the top level, and a top-level key with a dot, stay as they are
 *   (MongoDB 5.0 or later keeps them). Another item is stored as JSON text in `_json`: null, a
 *   primitive, an array, an object with a top-level key of the storage or a top-level key that
 *   starts with `$`, a key `__proto__`, or a class instance other than `Date`. Both ways give the
 *   item back as it was. An object with a text `$ref` and an `$id` is refused (`TypeError`):
 *   MongoDB gives it back as a `DBRef`.
 * - An item whose `_id` is its id keeps it: the storage gives it back.
 * - The fields of the storage: `_key` (the id), `_part` (the partition), `_seq` (the sequence
 *   number of the last write), `_ord` (the number of the first write: the order of the entries, as
 *   a `Map` keeps it) and `_tomb` (a deleted item).
 * - With a partition, the stored `_id` is `<partition>` + U+001F + `<id>`. An id cannot have the
 *   character U+001F. Each partition reads and writes only its documents: each write filter has the
 *   partition too, so a write of a stored `_id` of another partition fails and changes nothing.
 *
 * The stored form (roadmap CLI-76): an app with its own form of documents keeps it with the option
 * `form`, one `StoredForm` object. `DEFAULT_STORED_FORM` gives the form above, byte for byte.
 * - `storedId(partition, id)` gives the stored `_id`, and `idOf(storedId, partition)` is its inverse.
 *   The stored `_id` can be any value but `undefined` and `null`, for example `tenant:key`.
 * - `partitionFields(partition)` gives the fields that name the partition (default `{ _part }`).
 *   Each document of the partition has them, and they are the filter of the partition. A field with
 *   the value `undefined` is absent: the document does not have it, and the filter is
 *   `{ $exists: false }`. An item can have a partition field (one that is not a field of the
 *   storage) with the value of its partition: the write leaves it out and notes it in `_kpf`, and
 *   the read gives it back. The same field with another value is refused (`TypeError`).
 * - `partitionOf(doc)` gives the partition of a stored document, for `ViewMaterializer`. A delete
 *   event has only the `documentKey`: so the `_id` must tell the partition, or the collection needs
 *   `changeStreamPreAndPostImages`.
 * - The storage adds its fields (`_key`, `_seq`, `_ord`, `_tomb`, and `_kid` or `_json` as needed)
 *   in each form. A reader of the raw documents can leave them out (`DOCUMENT_STORAGE_FIELDS`), and
 *   must leave out the tombstones (`TOMBSTONE_FIELD` is `true`). `decodeStoredDocument(doc)` does
 *   this, as the storage reads a document.
 * - A document without the fields of the storage (for example one written before the app used the
 *   storage) is an item too. Its id comes from `idOf`, else from `_key`, and its item gets that id
 *   as `_id`. Its partition fields follow the rule of a written document without `_kpf`: a field
 *   with the value of the partition stays out, and a field with another value stays in. So the
 *   item has the same form before and after its first write. A document whose id neither
 *   tells (for example an `ObjectId` that `idOf` does not name) is not an item: the reads and
 *   `size()` leave it out. Its version is `0`, and it comes before the other items in the order of
 *   the entries (then by `_id`). A full result of the change log has it, and a delta has it after
 *   its first write through the storage. That write gives it its fields and a version, and keeps
 *   its place.
 * - Write through the storage. A raw write (for example `findOneAndReplace` or a script) takes no
 *   number of the sequence, so a delta of the change log does not give it, and a raw replace drops
 *   `_seq`.
 * - A raw writer must not hard-delete an item while the storage writes it. The write of a document
 *   without `_seq` is an upsert with `{ _seq: { $exists: false } }`: after a hard delete between
 *   the read and the write, the upsert inserts the document again.
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
 * - The storage uses a transaction only with a client: the option `client`, or the default
 *   connection when `db` is absent. With `db` and no `client`, each write uses the watermark, also
 *   on a replica set.
 *
 * The queries: `query()` sends the conditions that MongoDB tests in the same way (the equality of
 * a string, a number or a boolean, and `$in` of them) as a filter. `queryEntries()` of the core
 * then gives the exact result, so a query always gives the result of the reference.
 *
 * The aggregations: `aggregate()` runs a read-only pipeline on the items of the partition, with
 * the guard of `scopePipeline()` and the limits of time and size.
 *
 * The preconditions (roadmap CLI-16): with the option `versionOf`, `set`, `delete` and `setBatch`
 * take an expected version. On a replica set, the test reads the items in the transaction of the
 * write, so the test and the write are one step. On a single server, each write of an item with a
 * precondition has the `_seq` that the test read in its filter (a compare-and-set). Another writer
 * between the test and the write makes the write fail with `VersionConflictError`. Then a batch of
 * more than one item can keep a part of its writes: only a transaction makes a batch all or nothing.
 * One case stays on a single server: a writer outside the storage that writes a document without
 * `_seq` between the test and the write. The guard of such a document is `{ _seq: { $exists:
 * false } }`, so it does not see that writer. On a replica set, the test and the write are one
 * transaction, and this case does not occur.
 */

import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { BSON, type AnyBulkWriteOperation, type ClientSession, type Collection, type Db, type Document, type Filter, type MongoClient } from "mongodb";
import {
  VersionConflictError,
  applyPatch,
  preconditionNotSupported,
  queryEntries,
  versionConflict,
  type CollectionStorage,
  type CurrentItem,
  type StorageBatchWriteOptions,
  type StorageChanges,
  type StorageItemWriteOptions,
  type StorageMetadata,
  type StoragePatch,
  type StorageQueryOptions,
  type StorageQueryPolicy,
  type StorageSelector,
  type StorageWriteOptions,
  type VersionConflict,
} from "@procedures/collections";
import { optionalMs, toMs, type Duration } from "@procedures/client";
import { ensureConnection } from "../connection.js";
import { noteOwnNumbers, notePrunedIds } from "./own-writes.js";
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
/** The partition fields that the item had with the value of its partition (roadmap CLI-76). The write leaves them out of the fields. */
const KEEP_PART = "_kpf";
const STORAGE_FIELDS: ReadonlySet<string> = new Set(["_id", KEY, PART, SEQ, ORD, TOMB, JSON_FIELD, KEEP_ID, KEEP_PART]);
/** The separator of the partition and the id in a stored `_id`. */
export const SEPARATOR = "\u001f";

/**
 * The fields that a `MongoDocumentStorage` can add to a stored document, in each stored form
 * (roadmap CLI-76). A reader of the raw documents can leave them out. The partition fields are
 * not in the list.
 */
export const DOCUMENT_STORAGE_FIELDS: readonly string[] = Object.freeze([KEY, PART, SEQ, ORD, TOMB, JSON_FIELD, KEEP_ID, KEEP_PART]);

/** The field that is `true` in a tombstone: the document of a deleted item. A reader of the raw documents leaves them out. */
export const TOMBSTONE_FIELD: "_tomb" = TOMB;

/**
 * The stored form of a `MongoDocumentStorage` (roadmap CLI-76): how an id and a partition become a
 * stored document, and back. Give the same object to the storage (`form`) and to a
 * `ViewMaterializer` (`storageSources`), or read it from `storage.form`.
 */
export interface StoredForm {
  /**
   * The stored `_id` of an id in a partition. It must give a value other than `undefined` and
   * `null`, and two ids of one partition must not give the same value.
   */
  storedId(partition: string | undefined, id: string): unknown;
  /** The inverse of `storedId`: the id of a stored `_id`, or `undefined` when the `_id` is not of the partition. */
  idOf(storedId: unknown, partition: string | undefined): string | undefined;
  /**
   * The fields that name a partition. Each document of the partition has them, and they are the
   * filter of the partition. A field with the value `undefined` is absent: the document does not
   * have it, and the filter is `{ $exists: false }`. Give the same names for each partition. A
   * top-level field of an item with one of these names and the value of the partition is left out
   * of the stored fields and noted in `_kpf`, and the read gives it back. Another value is refused
   * with a `TypeError`.
   */
  partitionFields(partition: string | undefined): Readonly<Record<string, unknown>>;
  /**
   * The partition of a stored document, or `undefined` when the document does not tell it. A
   * `ViewMaterializer` gives the document of a change event: `fullDocument`, else
   * `fullDocumentBeforeChange`, else `documentKey`. A delete event has only `documentKey`, so with
   * another `storedId`, the `_id` must tell the partition, or the collection needs
   * `changeStreamPreAndPostImages`. The storage writes a delete as a tombstone (a replace event with
   * the whole document), so the gap is only for a raw hard delete.
   */
  partitionOf(doc: Document): string | undefined;
}

/**
 * The default stored form, the form of 0.34.0. The stored `_id` is the id, or `<partition>` +
 * U+001F + `<id>` with a partition. The partition field is `_part` (absent without a partition).
 * `partitionOf` reads `_part`, else the part of `_id` before U+001F.
 */
export const DEFAULT_STORED_FORM: StoredForm = Object.freeze({
  storedId(partition: string | undefined, id: string): string {
    return partition === undefined ? id : `${partition}${SEPARATOR}${id}`;
  },
  idOf(storedId: unknown, partition: string | undefined): string | undefined {
    if (typeof storedId !== "string") return undefined;
    if (partition === undefined) return storedId.includes(SEPARATOR) ? undefined : storedId;
    const prefix = `${partition}${SEPARATOR}`;
    return storedId.startsWith(prefix) ? storedId.slice(prefix.length) : undefined;
  },
  partitionFields(partition: string | undefined): Record<string, unknown> {
    return { [PART]: partition };
  },
  partitionOf(doc: Document): string | undefined {
    if (typeof doc[PART] === "string") return doc[PART];
    const id: unknown = doc["_id"];
    const at = typeof id === "string" ? id.indexOf(SEPARATOR) : -1;
    return at > 0 ? (id as string).slice(0, at) : undefined;
  },
});

/** The options of a `MongoDocumentStorage`. */
export interface MongoDocumentStorageOptions<T = unknown> {
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
   * connection when `db` is absent. Without a client, the writes use the watermark: with `db` and
   * no `client`, a write is not a transaction, also on a replica set.
   */
  client?: (() => MongoClient | Promise<MongoClient>) | undefined;
  /**
   * `auto` (the default): a write is a transaction on a replica set or a sharded cluster, and uses
   * the watermark on a single server. `never`: each write uses the watermark.
   */
  transactions?: "auto" | "never" | undefined;
  /**
   * The version of an item, for example `(item) => item.rev` (roadmap CLI-16). With it, `set`,
   * `delete` and `setBatch` take an expected version: a write whose current item has another
   * version changes nothing and rejects with `VersionConflictError`. Without it, a write with an
   * expected version rejects with a `TypeError`. `versionOf(id)` of the storage is another thing:
   * the sequence number of the last write.
   */
  versionOf?: ((item: T) => string | undefined) | undefined;
  /**
   * The stored form (roadmap CLI-76): the stored `_id`, its inverse, the partition fields and the
   * partition of a document. The default `DEFAULT_STORED_FORM` writes the documents of 0.34.0.
   */
  form?: StoredForm | undefined;
}

/** True for the error of a duplicate key: an insert of an upsert whose filter found no document. */
function isDuplicateKey(error: unknown): boolean {
  // A bulk write error has the code of its first write error, and the list of the write errors
  const { code, writeErrors } = (error ?? {}) as { code?: unknown; writeErrors?: unknown };
  return code === 11000 || [writeErrors].flat().some((entry) => (entry as { code?: unknown } | null)?.code === 11000);
}

/** A stored document. Its `_id` comes from `storedId`: a text by default, any value but `undefined` and `null` in another form. */
type Stored = Document;

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

/**
 * True for a value of a field that BSON gives back as it is: a key with `$` or a dot stays as it is
 * (MongoDB 5.0 or later). False when only JSON text keeps it: a class instance other than `Date`,
 * or a key `__proto__`. An object that BSON gives back as a `DBRef` adds a problem.
 */
function isNativeValue(value: unknown, path: string, problems: string[]): boolean {
  if (Array.isArray(value)) return value.every((element, index) => isNativeValue(element, `${path}.${index}`, problems));
  if (typeof value !== "object" || value === null) return true;
  const proto = Object.getPrototypeOf(value) as unknown;
  if (proto !== Object.prototype && proto !== null) return value instanceof Date;
  const object = value as Record<string, unknown>;
  // The test of the BSON reader: a text `$ref`, an `$id`, and no `$db` or a text `$db`
  if (typeof object["$ref"] === "string" && object["$id"] !== undefined && object["$id"] !== null && (object["$db"] === undefined || typeof object["$db"] === "string")) {
    problems.push(`the field ${path} has $ref and $id, and MongoDB gives it back as a DBRef`);
  }
  for (const [key, field] of Object.entries(object)) {
    if (key === "__proto__") return false;
    if (!isNativeValue(field, `${path}.${key}`, problems)) return false;
  }
  return true;
}

/** The fields of the flat document of an item. */
interface FlatItem {
  /** True when the item has `_id`, equal to its id. */
  keepsId: boolean;
  /** The partition fields that the item has with the value of its partition: the write leaves them out. */
  kept: string[];
  fields: Array<[string, unknown]>;
}

/**
 * The item of a stored document (not a tombstone) whose id is known. `_json` gives the item as it
 * was. Else the fields of the storage stay out, the item gets `_id` when it had it (`_kid`), when
 * the document is from outside the storage (no `_key`) or with `addId`, and it gets back the
 * partition fields of `_kpf`. A partition field with the value of the partition stays out (for a
 * document from outside the storage too); a field with another value stays in.
 */
function itemOf(doc: Document, id: string, partitionEntries: ReadonlyArray<readonly [string, unknown]>, addId: boolean): unknown {
  if (typeof doc[JSON_FIELD] === "string") {
    const item = JSON.parse(doc[JSON_FIELD]) as unknown;
    if (addId && isPlainObject(item) && !("_id" in item)) return { _id: id, ...item };
    return item;
  }
  const outside = doc[KEY] === undefined;
  const value: Record<string, unknown> = {};
  if (addId || outside || doc[KEEP_ID] === true) value["_id"] = id;
  const partitionValues = new Map(partitionEntries);
  for (const [key, field] of Object.entries(doc)) {
    if (STORAGE_FIELDS.has(key)) continue;
    // The value of the partition comes back only through `_kpf`, so the item has one form at each age of its document
    if (partitionValues.has(key) && isDeepStrictEqual(field, partitionValues.get(key))) continue;
    put(value, key, field);
  }
  const kept = doc[KEEP_PART];
  if (Array.isArray(kept)) {
    for (const [name, field] of partitionEntries) if (kept.includes(name) && !STORAGE_FIELDS.has(name)) put(value, name, field);
  }
  return value;
}

/** The options of `decodeStoredDocument`. */
export interface DecodeStoredDocumentOptions {
  /** The stored form of the storage, for example `storage.form` (default `DEFAULT_STORED_FORM`). */
  form?: StoredForm | undefined;
  /** The partition of the document. The default is `form.partitionOf(doc)`. */
  partition?: string | undefined;
  /**
   * True (the default): an item that is a plain object without `_id` gets its id as `_id`. False:
   * the item is as the storage gives it, with `_id` only when it had it.
   */
  addId?: boolean | undefined;
}

/** An item of a stored document, from `decodeStoredDocument`. */
export interface StoredDocumentEntry<T> {
  /** The id of the item. */
  id: string;
  /** The partition of the document. */
  partition: string | undefined;
  /** The item. */
  item: T;
}

/**
 * This function reads a raw document of a `MongoDocumentStorage` collection as the storage reads
 * it (roadmap CLI-76), for an app that reads the collection directly (a query, a view, an
 * aggregation). It gives `undefined` for a tombstone and for a document whose id neither `idOf`
 * nor `_key` tells. Else it parses `_json`, leaves out the fields of the storage
 * (`DOCUMENT_STORAGE_FIELDS`) and gives the item its id as `_id` (see `addId`).
 *
 * @example
 * ```typescript
 * const items = docs.flatMap((doc) => decodeStoredDocument<Note>(doc, { form: notes.form })?.item ?? []);
 * ```
 */
export function decodeStoredDocument<T = Document>(doc: Document, options: DecodeStoredDocumentOptions = {}): StoredDocumentEntry<T> | undefined {
  if (!isPlainObject(doc) || doc[TOMB] === true) return undefined;
  const form = options.form ?? DEFAULT_STORED_FORM;
  const partition = options.partition ?? form.partitionOf(doc);
  const fromId = form.idOf(doc["_id"], partition);
  const id = typeof fromId === "string" ? fromId : typeof doc[KEY] === "string" ? doc[KEY] : undefined;
  if (id === undefined) return undefined;
  const entries = Object.entries(form.partitionFields(partition));
  return { id, partition, item: itemOf(doc, id, entries, options.addId ?? true) as T };
}

/**
 * This function gives the version of a raw stored document of a `MongoDocumentStorage`: the
 * version that `storage.versionOf(id)` gives for the same document (roadmap CLI-77). The storage
 * uses it too, so the two never differ.
 *
 * - The version is the sequence number of the last write through the storage (`_seq`), as text.
 * - A document without `_seq` (an old document, or one that a raw replace wrote) has the version `0`.
 * - A tombstone, a value that is not a plain object, and a document whose id neither `idOf` nor
 *   `_key` tells give `undefined`: they are no items, as for `decodeStoredDocument`.
 *
 * @param doc - The stored document, for example the `fullDocument` of a change event
 * @param form - The stored form of the storage, for example `storage.form` (default `DEFAULT_STORED_FORM`)
 * @param partition - The partition of the document. The default is `form.partitionOf(doc)`.
 *
 * @example
 * ```typescript
 * const version = versionOfStored(change.fullDocument, notes.form); // the same as await notes.versionOf(id)
 * ```
 */
export function versionOfStored(doc: Document, form: StoredForm = DEFAULT_STORED_FORM, partition?: string): string | undefined {
  if (!isPlainObject(doc) || doc[TOMB] === true) return undefined;
  const place = partition ?? form.partitionOf(doc);
  if (typeof form.idOf(doc["_id"], place) !== "string" && typeof doc[KEY] !== "string") return undefined;
  return seqVersion(doc);
}

/** The version of the `_seq` of a stored document: the number as text, or `0` without it. */
function seqVersion(doc: Document): string {
  const seq = doc[SEQ];
  return typeof seq === "number" ? String(seq) : "0";
}

/**
 * The parts of a storage that `watchStorageChanges` reads (roadmap CLI-77). The package does not
 * export this type: it is for the modules of the storage.
 */
export interface StorageChangeSource {
  /** The database of the storage. */
  db(): Promise<Db>;
  /** The MongoDB collection of the items. */
  collection: string;
  /** The collection of the sequence counters. */
  counters: string;
  /** The stored form. */
  form: StoredForm;
  /** The partition of the storage, or undefined for the storage of the whole collection. */
  partition: string | undefined;
  /** This method adopts a raw write (D39): see `RawStorageWrite`. */
  adopt(raw: RawStorageWrite): Promise<RawAdoption>;
  /**
   * This method adopts several raw writes: the writes of each partition take one block of numbers.
   * A partition whose writes fail gives `{ error }` for each of its writes.
   */
  adoptAll(raws: readonly RawStorageWrite[]): Promise<RawAdoptionResult[]>;
  /**
   * One page of the documents without `_seq` (the sweep of the raw writes), in the order of `_id`,
   * after the `_id` of `after` (from the start without it).
   */
  rawDocuments(after: { readonly id: unknown } | undefined, limit: number): Promise<Document[]>;
  /** The stored documents of these stored `_id`s: the watcher adopts a raw write again after a full queue or a failure. */
  storedDocuments(ids: readonly unknown[]): Promise<Document[]>;
  /**
   * The partitions that the storage knows: each partition with a floor document in the counters,
   * and each partition of `forPartition()` in this process. It rejects when the counters cannot be read.
   */
  partitions(): Promise<Array<string | undefined>>;
}

/**
 * A raw write of the collection (D39): a change event of a document that the storage did not write.
 * The storage adopts it: one conditional write gives the document a new `_seq` through the path of
 * each write (the transaction, or the watermark and the late move), so `changes(since)` has it.
 *
 * - The filter is the stored `_id` and the `_seq` that the event saw (or no `_seq`): when the
 *   document changed since (a later adoption, or a write of the storage), the adoption does
 *   nothing. Thus one adoption wins.
 * - The adoption sets `_seq`, and the storage fields and partition fields that the document does
 *   not have: from the image before the change, else from the stored `_id` (`form.idOf()`,
 *   `form.partitionOf()`). It never changes a field of the item.
 * - A hard delete (no `after`) needs the image before the change: the adoption inserts a tombstone
 *   with a new `_seq`, and the insert fails when the `_id` exists again.
 * - The numbers of an adoption are never noted as numbers of this process: its change event is
 *   the hint of the raw write.
 */
export interface RawStorageWrite {
  /** The stored `_id` of the document (`documentKey._id`). */
  readonly storedId: unknown;
  /** The `_seq` of the state that the event saw, or undefined for a document without `_seq`. */
  readonly seq: number | undefined;
  /** The document after the write, or undefined for a hard delete. */
  readonly after?: Document | undefined;
  /** The image of the document before the change, when the collection keeps it (`changeStreamPreAndPostImages`). */
  readonly before?: Document | undefined;
}

/** The result of an adoption: `adopted`, `lost` (the document changed since: another adoption or write won), or `unknown` (no image and no stored `_id` tells the id and the partition). */
export type RawAdoption = "adopted" | "lost" | "unknown";

/** True when two values have the same BSON. */
function sameBson(a: unknown, b: unknown): boolean {
  try {
    return Buffer.from(BSON.serialize({ v: a })).equals(Buffer.from(BSON.serialize({ v: b })));
  } catch {
    return false;
  }
}

/** The result of one raw write of `adoptAll()`: a `RawAdoption`, or the error of the write of its partition. */
export type RawAdoptionResult = RawAdoption | { readonly error: unknown };

/** The most floor documents that `partitions()` reads. */
const MAX_KNOWN_PARTITIONS = 10_000;

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The reader of the parts of a storage. The class sets it, so it can read its private fields. */
let sourceOfStorage: <T>(storage: MongoDocumentStorage<T>) => StorageChangeSource;

/** This function gives the parts of a storage that `watchStorageChanges` reads. The package does not export it. */
export function storageChangeSource<T>(storage: MongoDocumentStorage<T>): StorageChangeSource {
  return sourceOfStorage(storage);
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

/** The options of `selectorPrefilter`. */
export interface SelectorPrefilterOptions {
  /**
   * The stored `_id` of an id. With it, a condition on `_id` with text values tests the stored
   * `_id` (and uses its index). Without it, the condition tests `_key`.
   */
  storedId?: ((id: string) => unknown) | undefined;
  /** More fields that only the storage writes, for example the partition fields: a condition on one of them does not go in the filter. */
  storageFields?: Iterable<string> | undefined;
}

/** The field of a stored document for a path of a selector, or undefined when the filter cannot test it. */
function storedPath(path: string, reserved: ReadonlySet<string>): string | undefined {
  if (path === "_id") return KEY;
  const parts = path.split(".");
  const first = parts[0]!;
  if (first === "_id" || STORAGE_FIELDS.has(first) || reserved.has(first)) return undefined;
  // A part with `$` is a field name of an item, but an operator for MongoDB
  if (parts.some((part) => part.startsWith("$"))) return undefined;
  return path;
}

/**
 * The filter of a condition on `_id` against the stored `_id`, or undefined. A flat item with an
 * `_id` has its id as `_id`, and an item stored as JSON passes the filter of `query()` anyway.
 */
function idConditionFilter(condition: unknown, storedId: (id: string) => unknown): Document | undefined {
  try {
    if (typeof condition === "string") return { _id: storedId(condition) };
    if (!isPlainObject(condition)) return undefined;
    const operators: Document = {};
    const eq = condition["$eq"];
    if (typeof eq === "string") operators["$eq"] = storedId(eq);
    const among = condition["$in"];
    if (Array.isArray(among) && among.length > 0 && among.every((value) => typeof value === "string")) operators["$in"] = among.map((value: string) => storedId(value));
    return Object.keys(operators).length > 0 ? { _id: operators } : undefined;
  } catch {
    // An id that the storage refuses: no condition is a correct filter (it can pass more)
    return undefined;
  }
}

/** The filter of one condition, or undefined when the filter cannot test it in the same way. */
function conditionFilter(path: string, condition: unknown, options: SelectorPrefilterOptions, reserved: ReadonlySet<string>): Document | undefined {
  if (path === "_id" && options.storedId) return idConditionFilter(condition, options.storedId);
  const field = storedPath(path, reserved);
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
export function selectorPrefilter(selector: StorageSelector, options: SelectorPrefilterOptions = {}): Document | undefined {
  return prefilter(selector, options, new Set(options.storageFields ?? []));
}

function prefilter(selector: StorageSelector, options: SelectorPrefilterOptions, reserved: ReadonlySet<string>): Document | undefined {
  const parts: Document[] = [];
  for (const [key, condition] of Object.entries(selector as Record<string, unknown>)) {
    if (condition === undefined) continue;
    if (key === "$and" && Array.isArray(condition)) {
      for (const branch of condition) {
        const filter = isPlainObject(branch) ? prefilter(branch as StorageSelector, options, reserved) : undefined;
        if (filter) parts.push(filter);
      }
    } else if (key === "$or" && Array.isArray(condition) && condition.length > 0) {
      const branches = condition.map((branch) => (isPlainObject(branch) ? prefilter(branch as StorageSelector, options, reserved) : undefined));
      // A branch without a condition passes each item: then the $or tests nothing
      if (branches.every((branch): branch is Document => branch !== undefined)) parts.push({ $or: branches });
    } else if (!key.startsWith("$")) {
      const filter = conditionFilter(key, condition, options, reserved);
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
  private readonly options: MongoDocumentStorageOptions<T>;
  private readonly collectionName: string;
  private readonly partition: string | undefined;
  private readonly maxTombstones: number;
  private readonly countersName: string;
  private readonly writeLeaseMs: number;
  /** The storages of the partitions, for `forPartition`: the same storage for the same partition. */
  private readonly partitions: Map<string, MongoDocumentStorage<T>>;
  /** The stored form of the documents (roadmap CLI-76). A `ViewMaterializer` of the collection takes the same form. */
  readonly form: StoredForm;
  /** The fields that name the partition, in their order. An `undefined` value is an absent field. */
  private readonly partitionEntries: ReadonlyArray<readonly [string, unknown]>;
  /** The values of the partition fields that are not fields of the storage, by name. */
  private readonly partitionValues: ReadonlyMap<string, unknown>;
  /** The fields that only the storage writes: its fields and the partition fields. */
  private readonly reserved: ReadonlySet<string>;
  private indexes: Promise<void> | undefined;
  private closed = false;

  static {
    sourceOfStorage = <S>(storage: MongoDocumentStorage<S>): StorageChangeSource => ({
      db: () => storage.database(),
      collection: storage.collectionName,
      counters: storage.countersName,
      form: storage.form,
      partition: storage.partition,
      adopt: (raw) => storage.adoptRaw(raw),
      adoptAll: (raws) => storage.adoptRawAll(raws),
      rawDocuments: (after, limit) => storage.rawDocuments(after, limit),
      storedDocuments: (ids) => storage.storedDocuments(ids),
      partitions: () => storage.knownPartitions(),
    });
  }

  constructor(options: MongoDocumentStorageOptions<T>, partitions?: Map<string, MongoDocumentStorage<T>>) {
    if (options.partition !== undefined && (options.partition === "" || options.partition.includes(SEPARATOR))) {
      throw new Error("A partition must be a text without the character U+001F");
    }
    const form = options.form ?? DEFAULT_STORED_FORM;
    for (const name of ["storedId", "idOf", "partitionFields", "partitionOf"] as const) {
      if (typeof form[name] !== "function") throw new TypeError(`The stored form must have the function ${name}`);
    }
    this.form = form;
    const fields = form.partitionFields(options.partition);
    if (!isPlainObject(fields) || Object.keys(fields).length === 0) throw new TypeError("partitionFields must give an object with at least one field");
    for (const name of Object.keys(fields)) {
      if (name === "_id" || name.startsWith("$") || name.includes(".") || name === "__proto__" || (STORAGE_FIELDS.has(name) && name !== PART)) {
        throw new TypeError(`partitionFields cannot have the field ${JSON.stringify(name)}`);
      }
    }
    this.partitionEntries = Object.entries(fields);
    this.partitionValues = new Map(this.partitionEntries.filter(([name]) => !STORAGE_FIELDS.has(name)));
    this.reserved = new Set([...STORAGE_FIELDS, ...Object.keys(fields)]);
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
    const prefix = Object.fromEntries(this.partitionEntries.map(([name]) => [name, 1]));
    this.indexes ??= items
      .createIndexes([{ key: { ...prefix, [SEQ]: 1 } }, { key: { ...prefix, [ORD]: 1 } }, { key: { ...prefix, [TOMB]: 1 } }])
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
    // An object value is an equality too, never a set of operators
    const condition = (value: unknown): unknown => (value === undefined ? { $exists: false } : typeof value === "object" && value !== null ? { $eq: value } : value);
    return Object.fromEntries(this.partitionEntries.map(([name, value]) => [name, condition(value)]));
  }

  /** This method puts the partition fields on a stored document, in their order. An absent field stays absent. */
  private putPartition(doc: Stored): void {
    for (const [name, value] of this.partitionEntries) if (value !== undefined) put(doc, name, value);
  }

  /** The filter of the items (not the tombstones) of the partition. */
  private liveFilter(extra?: Document): Filter<Stored> {
    return { ...this.partitionFilter(), [TOMB]: { $ne: true }, ...extra } as Filter<Stored>;
  }

  /** The stored `_id` of an id. An id with the separator could name an item of a partition: it is refused. */
  private storedId(id: string): unknown {
    if (typeof id !== "string" || id.includes(SEPARATOR)) throw new Error("An id must be a text without the character U+001F");
    const stored = this.form.storedId(this.partition, id);
    if (stored === undefined || stored === null) throw new TypeError(`storedId gave ${String(stored)} for the id ${JSON.stringify(id)}`);
    return stored;
  }

  /** The id of a stored document: the inverse of its stored `_id`, else `_key`, or undefined when neither tells it. */
  private idOfDoc(doc: Document): string | undefined {
    const id = this.form.idOf(doc["_id"], this.partition);
    if (typeof id === "string") return id;
    const key = doc[KEY];
    return typeof key === "string" ? key : undefined;
  }

  /** The place of a stored document in the order of the entries. A document without `_ord` comes first. */
  private placeOf(doc: Document): number {
    const ord = doc[ORD];
    return typeof ord === "number" ? ord : 0;
  }

  /** The filter of a write of one stored document: its `_id` and the partition. */
  private writeFilter(id: string): Filter<Stored> {
    return { _id: this.storedId(id), ...this.partitionFilter() } as Filter<Stored>;
  }

  /** The stored document of an item, with the number of this write and the number of its place. */
  private encode(id: string, value: T, seq: number, ord: number): Stored {
    const doc: Stored = { _id: this.storedId(id), [KEY]: id, [SEQ]: seq, [ORD]: ord };
    this.putPartition(doc);
    const flat = this.flatOf(id, value);
    if (flat) {
      if (flat.keepsId) doc[KEEP_ID] = true;
      if (flat.kept.length > 0) doc[KEEP_PART] = flat.kept;
      for (const [key, field] of flat.fields) put(doc, key, field);
    } else {
      doc[JSON_FIELD] = JSON.stringify(value);
    }
    return doc;
  }

  /**
   * The fields of the flat document of an item, or undefined when only JSON text keeps it: an item
   * that is not a plain object, an `_id` other than its id, a top-level key of the storage or with
   * `$`, a key `__proto__`, a class instance other than `Date`. It throws a `TypeError` for a flat
   * item that a document cannot keep: a partition field with another value than the partition, or
   * an object that MongoDB gives back as a `DBRef`.
   */
  private flatOf(id: string, value: T): FlatItem | undefined {
    if (!isPlainObject(value)) return undefined;
    if ("_id" in value && value["_id"] !== id) return undefined;
    const flat: FlatItem = { keepsId: "_id" in value, kept: [], fields: [] };
    const problems: string[] = [];
    for (const [key, field] of Object.entries(value)) {
      if (key === "_id") continue;
      if (key.startsWith("$") || key === "__proto__" || STORAGE_FIELDS.has(key)) return undefined;
      if (this.partitionValues.has(key)) {
        // The partition field restores it on read; another value would put the document in another partition
        if (isDeepStrictEqual(field, this.partitionValues.get(key))) flat.kept.push(key);
        else problems.push(`the field ${key} names the partition and has another value than the partition`);
        continue;
      }
      if (!isNativeValue(field, key, problems)) return undefined;
      flat.fields.push([key, field]);
    }
    if (problems.length > 0) throw new TypeError(`The storage cannot keep the item ${JSON.stringify(id)}: ${problems.join("; ")}`);
    return flat;
  }

  /** The id and the item of a stored document, or undefined when the document does not tell its id. */
  private decode(doc: Document, known?: string): [string, T] | undefined {
    const id = this.idOfDoc(doc) ?? known;
    if (id === undefined) return undefined;
    return [id, itemOf(doc, id, this.partitionEntries, false) as T];
  }

  /** The entries of stored documents, in their order. A document that does not tell its id is left out. */
  private decodeAll(docs: readonly Document[]): Array<[string, T]> {
    const entries: Array<[string, T]> = [];
    for (const doc of docs) {
      const entry = this.decode(doc);
      if (entry) entries.push(entry);
    }
    return entries;
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
   * documents to new numbers. With `own` false (an adoption of a raw write, D39), a watcher of this
   * process does not take the numbers as its own.
   */
  private async withNumbers<R>(
    db: Db,
    collection: Collection<Stored>,
    count: number,
    write: (first: number, session?: ClientSession) => Promise<R>,
    own = true
  ): Promise<R> {
    const noteOwn = own ? noteOwnNumbers : (): void => undefined;
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
          // A watcher of the collection in this process skips the events of these numbers (roadmap CLI-77)
          noteOwn(db, this.collectionName, counter.seq - count + 1, count);
          return write(counter.seq - count + 1, session);
        });
      } finally {
        await session.endSession();
      }
    }
    let { first } = await this.allocate(db, count);
    noteOwn(db, this.collectionName, first, count);
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
      noteOwn(db, this.collectionName, next, count);
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
    // A watcher of this process reads the delete of a pruned tombstone without the image before the change (roadmap CLI-77)
    notePrunedIds(db, this.collectionName, oldest.map((doc) => doc._id));
    await items.deleteMany({ _id: { $in: oldest.map((doc) => doc._id) } } as Filter<Stored>);
    const floor = Math.max(...oldest.map((doc) => Number(doc[SEQ])));
    await db.collection<CounterDoc>(this.countersName).updateOne({ _id: this.floorId() }, { $max: { floor } }, { upsert: true });
  }

  /** The ids of stored documents, in their order. A document that does not tell its id is left out. */
  private idsOf(docs: readonly Document[]): string[] {
    const ids: string[] = [];
    for (const doc of docs) {
      const id = this.idOfDoc(doc);
      if (id !== undefined) ids.push(id);
    }
    return ids;
  }

  /** The items of the partition, in the order of the entries. */
  private async liveDocs(extra?: Document): Promise<Document[]> {
    const { items } = await this.collection();
    return items.find(this.liveFilter(extra)).sort({ [ORD]: 1, _id: 1 }).toArray();
  }

  /** The places (`_ord`) of the items of some ids that the partition has. */
  private async placesOf(collection: Collection<Stored>, ids: readonly string[]): Promise<Map<string, number>> {
    const docs = await collection
      .find(this.liveFilter({ _id: { $in: [...new Set(ids)].map((id) => this.storedId(id)) } }), { projection: { [KEY]: 1, [ORD]: 1 } })
      .toArray();
    const places = new Map<string, number>();
    for (const doc of docs) {
      const id = this.idOfDoc(doc);
      if (id !== undefined) places.set(id, this.placeOf(doc));
    }
    return places;
  }

  // ===========================================================================
  // Reads
  // ===========================================================================

  async get(id: string): Promise<T | undefined> {
    const { items } = await this.collection();
    const doc = await items.findOne(this.liveFilter({ _id: this.storedId(id) }));
    return doc ? this.decode(doc, id)?.[1] : undefined;
  }

  async getAll(): Promise<T[]> {
    return this.decodeAll(await this.liveDocs()).map(([, value]) => value);
  }

  async getEntries(): Promise<Array<[string, T]>> {
    return this.decodeAll(await this.liveDocs());
  }

  async getIds(): Promise<string[]> {
    const { items } = await this.collection();
    const docs = await items.find(this.liveFilter(), { projection: { _id: 1, [KEY]: 1 } }).sort({ [ORD]: 1, _id: 1 }).toArray();
    return this.idsOf(docs);
  }

  async find(predicate: (item: T) => boolean): Promise<T[]> {
    return (await this.getAll()).filter(predicate);
  }

  async query(selector: StorageSelector, options?: StorageQueryOptions, policy?: StorageQueryPolicy): Promise<Array<[string, T]>> {
    const rule = policy ?? this.options.queryPolicy;
    // The reference checks the selector and the options first, without a read of the database
    queryEntries([], selector, options, rule);
    const filter = selectorPrefilter(selector, { storedId: (id) => this.storedId(id), storageFields: this.reserved });
    const docs = await this.liveDocs(filter ? { $or: [{ [JSON_FIELD]: { $exists: true } }, filter] } : undefined);
    return queryEntries(this.decodeAll(docs), selector, options, rule) as Array<[string, T]>;
  }

  async has(id: string): Promise<boolean> {
    const { items } = await this.collection();
    return (await items.countDocuments(this.liveFilter({ _id: this.storedId(id) }), { limit: 1 })) > 0;
  }

  async size(): Promise<number> {
    const { items } = await this.collection();
    // A document with `_key` tells its id. A document from outside the storage counts only when `idOf` names it, as in getAll
    const [all, outside] = await Promise.all([
      items.countDocuments(this.liveFilter()),
      items.find(this.liveFilter({ [KEY]: { $exists: false } }), { projection: { _id: 1 } }).toArray(),
    ]);
    return all - (outside.length - this.idsOf(outside).length);
  }

  async getBatch(ids: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>();
    if (ids.length === 0) {
      this.checkOpen();
      return result;
    }
    const { items } = await this.collection();
    const docs = await items.find(this.liveFilter({ _id: { $in: ids.map((id) => this.storedId(id)) } })).toArray();
    const byId = new Map(this.decodeAll(docs));
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

  /**
   * The version of an item: the sequence number of its last write, or undefined for a missing id.
   * An item without a write through the storage (no `_seq`) has the version `0`. It is the version
   * of `versionOfStored()` of the stored document (roadmap CLI-77): the two share one rule.
   */
  async versionOf(id: string): Promise<string | undefined> {
    const { items } = await this.collection();
    const doc = await items.findOne(this.liveFilter({ _id: this.storedId(id) }), { projection: { [SEQ]: 1 } });
    // The filter finds the document by the stored `_id` of the id in the partition: it is the item
    return doc ? seqVersion(doc) : undefined;
  }

  async getChangesSince(since?: string): Promise<StorageChanges<T>> {
    const { db, items } = await this.collection();
    return enqueue(db, this.collectionName, async () => {
      const counter = await this.watermark(db);
      const version = `${counter.epoch}.${counter.seq}`;
      const full = async (): Promise<StorageChanges<T>> => ({
        version,
        full: true,
        changed: this.decodeAll(await items.find(this.liveFilter()).sort({ [ORD]: 1, _id: 1 }).toArray()),
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
        const id = this.idOfDoc(doc);
        if (id === undefined) continue;
        if (doc[TOMB] === true) deleted.push(id);
        else changed.push(this.decode(doc, id)!);
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

  async set(id: string, value: T, options?: StorageItemWriteOptions): Promise<void> {
    await this.setBatch([[id, value]], options?.expectedVersion === undefined ? undefined : { expectedVersions: [[id, options.expectedVersion]] });
  }

  /**
   * This method writes several items. With `expectedVersions`, a conflict of one id rejects with
   * `VersionConflictError` (roadmap CLI-16): the class comment tells when a batch is all or nothing.
   */
  async setBatch(items: Array<[string, T]>, options?: StorageBatchWriteOptions): Promise<void> {
    const expected = this.preconditions(options?.expectedVersions ?? []);
    if (items.length === 0) {
      this.checkOpen();
      return;
    }
    // The ids and the encoding are checked before a number of the sequence goes
    for (const [id, value] of items) {
      this.storedId(id);
      this.flatOf(id, value);
      JSON.stringify(value);
    }
    await this.write(async (db, collection) => {
      const places = await this.placesOf(collection, items.map(([id]) => id));
      await this.withNumbers(db, collection, items.length, async (first, session) => {
        const guards = await this.checkVersions(collection, expected, session);
        const placed = new Map(places);
        const operations: AnyBulkWriteOperation<Stored>[] = items.map(([id, value], index) => {
          const seq = first + index;
          // A new id takes its place at its first write; a later write of the batch keeps it
          if (!placed.has(id)) placed.set(id, seq);
          // The guard of an id with a precondition: the write fails when another writer came first
          const guard = guards.get(id);
          guards.delete(id);
          return { replaceOne: { filter: { ...this.writeFilter(id), ...guard }, replacement: this.encode(id, value, seq, placed.get(id)!), upsert: true } };
        });
        try {
          await collection.bulkWrite(operations, { ordered: true, ...(session ? { session } : {}) });
        } catch (error) {
          if (expected.length > 0 && !session && isDuplicateKey(error)) throw await this.lateConflict(collection, expected);
          throw error;
        }
      });
    });
  }

  async patch(id: string, fields: StoragePatch, _options?: StorageWriteOptions): Promise<T | undefined> {
    return this.write(async (db, collection) => {
      const doc = await collection.findOne(this.liveFilter({ _id: this.storedId(id) }));
      if (!doc) return undefined;
      const next = applyPatch(this.decode(doc, id)![1], fields) as T;
      // The encoding is checked before a number of the sequence goes
      this.flatOf(id, next);
      await this.withNumbers(db, collection, 1, (first, session) =>
        collection.replaceOne(this.writeFilter(id), this.encode(id, next, first, this.placeOf(doc)), { upsert: true, ...(session ? { session } : {}) })
      );
      return next;
    });
  }

  /**
   * This method deletes an item. With `expectedVersion`, a conflict rejects with
   * `VersionConflictError` and deletes nothing (roadmap CLI-16).
   */
  async delete(id: string, options?: StorageItemWriteOptions): Promise<boolean> {
    if (options?.expectedVersion === undefined) return (await this.deleteBatch([id], options)) > 0;
    const expected = this.preconditions([[id, options.expectedVersion]]);
    return this.write(async (db, collection) => {
      const live = await collection.findOne(this.liveFilter({ _id: this.storedId(id) }), { projection: { _id: 1 } });
      if (!live) {
        // No item to delete: the precondition holds only for the expected version null
        await this.checkVersions(collection, expected);
        return false;
      }
      await this.tombstone(db, collection, [id], expected);
      return true;
    });
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
      const liveIds = new Set(this.idsOf(live));
      const deleted = unique.filter((id) => liveIds.has(id));
      await this.tombstone(db, collection, deleted);
      return deleted.length;
    });
  }

  async clear(_options?: StorageWriteOptions): Promise<void> {
    await this.write(async (db, collection) => {
      const live = await collection.find(this.liveFilter(), { projection: { _id: 1, [KEY]: 1 } }).sort({ [ORD]: 1, _id: 1 }).toArray();
      const ids = this.idsOf(live);
      if (ids.length === 0) return;
      await this.tombstone(db, collection, ids);
    });
  }

  /**
   * This method replaces the items of the ids with tombstones, with new numbers, in the queue of the
   * collection. With preconditions, it tests them first (roadmap CLI-16).
   */
  private async tombstone(db: Db, collection: Collection<Stored>, ids: string[], expected: ReadonlyArray<readonly [string, string | null]> = []): Promise<void> {
    await this.withNumbers(db, collection, ids.length, async (first, session) => {
      const guards = await this.checkVersions(collection, expected, session);
      const operations: AnyBulkWriteOperation<Stored>[] = ids.map((id, index) => {
        const tomb: Stored = { _id: this.storedId(id), [KEY]: id, [SEQ]: first + index, [TOMB]: true };
        this.putPartition(tomb);
        return { replaceOne: { filter: { ...this.writeFilter(id), ...guards.get(id) }, replacement: tomb } };
      });
      const result = await collection.bulkWrite(operations, { ordered: true, ...(session ? { session } : {}) });
      // A guard that found no document: another writer came between the test and the write
      if (expected.length > 0 && !session && result.matchedCount < operations.length) throw await this.lateConflict(collection, expected);
    });
    await this.pruneTombstones(db, collection);
  }

  // ===========================================================================
  // The raw writes (D39, roadmap CLI-77)
  // ===========================================================================

  /**
   * This method adopts a raw write: one conditional write through the path of each write gives the
   * document a new `_seq` (see `RawStorageWrite`). It is for `watchStorageChanges()`, and it is no
   * general setter of `_seq`.
   */
  private async adoptRaw(raw: RawStorageWrite): Promise<RawAdoption> {
    const [result] = await this.adoptRawAll([raw]);
    if (result === undefined || typeof result !== "string") throw (result as { error: unknown } | undefined)?.error;
    return result;
  }

  /**
   * This method adopts several raw writes. The writes of each partition take one block of numbers
   * through the path of each write. A number of a write that does not win stays unused.
   */
  private async adoptRawAll(raws: readonly RawStorageWrite[]): Promise<RawAdoptionResult[]> {
    const results: RawAdoptionResult[] = raws.map(() => "unknown");
    const groups = new Map<MongoDocumentStorage<T>, Array<{ index: number; raw: RawStorageWrite; id: string }>>();
    raws.forEach((raw, index) => {
      const target = this.adoptionTarget(raw);
      if (!target) return;
      let group = groups.get(target.storage);
      if (!group) groups.set(target.storage, (group = []));
      group.push({ index, raw, id: target.id });
    });
    for (const [storage, group] of groups) {
      try {
        const done = await storage.adoptGroup(group);
        group.forEach((entry, position) => (results[entry.index] = done[position] ?? "lost"));
      } catch (error) {
        for (const entry of group) results[entry.index] = { error };
      }
    }
    return results;
  }

  /** The adoption of raw writes of this partition, with one block of numbers. */
  private async adoptGroup(group: ReadonlyArray<{ raw: RawStorageWrite; id: string }>): Promise<RawAdoption[]> {
    return this.write(async (db, collection) => {
      const results = await this.withNumbers(
        db,
        collection,
        group.length,
        async (first, session): Promise<RawAdoption[]> => {
          const out: RawAdoption[] = [];
          for (const [position, { raw, id }] of group.entries()) {
            const seq = first + position;
            out.push(raw.after === undefined ? await this.adoptDelete(collection, raw, id, seq, session) : await this.adoptWrite(collection, raw, raw.after, id, seq, session));
          }
          return out;
        },
        false
      );
      if (results.some((result, position) => result === "adopted" && group[position]!.raw.after === undefined)) await this.pruneTombstones(db, collection);
      return results;
    });
  }

  /** A raw hard delete: a tombstone with the id and the partition of the image before the change. */
  private async adoptDelete(collection: Collection<Stored>, raw: RawStorageWrite, id: string, seq: number, session: ClientSession | undefined): Promise<RawAdoption> {
    // In a transaction, a duplicate key would end the transaction: the read comes first
    if (session && (await collection.findOne({ _id: raw.storedId } as Filter<Stored>, { projection: { _id: 1 }, session }))) return "lost";
    const tomb: Stored = { _id: raw.storedId, [KEY]: id, [SEQ]: seq, [TOMB]: true };
    this.putPartition(tomb);
    try {
      await collection.insertOne(tomb, session ? { session } : {});
      return "adopted";
    } catch (error) {
      // A raw insert of the same _id came after the delete: that insert is the newer state
      if (isDuplicateKey(error)) return "lost";
      throw error;
    }
  }

  /** A raw insert, replace or update: one conditional write on the exact state of the event. */
  private async adoptWrite(collection: Collection<Stored>, raw: RawStorageWrite, after: Document, id: string, seq: number, session: ClientSession | undefined): Promise<RawAdoption> {
    const fields = this.restoredFields(raw, after, id);
    // The exact state of the event: the same `_seq` (or none), and no field that the adoption sets
    const filter: Document = { _id: raw.storedId, [SEQ]: raw.seq ?? { $exists: false } };
    for (const name of Object.keys(fields)) filter[name] = { $exists: false };
    const result = await collection.updateOne(filter as Filter<Stored>, { $set: { ...fields, [SEQ]: seq } }, session ? { session } : {});
    return result.matchedCount === 1 ? "adopted" : "lost";
  }

  /** One page of the documents without `_seq`, in the order of `_id` (the sweep of `watchStorageChanges()`). */
  private async rawDocuments(after: { readonly id: unknown } | undefined, limit: number): Promise<Document[]> {
    const db = await this.database();
    // The scan walks the index of _id from the last _id: `min` bounds the scan, in the order of the
    // BSON types. `min` includes that _id, so the page skips it. No index can find the documents
    // without a field (a partial index cannot express $exists: false): the scan reads each document.
    let cursor = db.collection(this.collectionName).find({ [SEQ]: { $exists: false } }).hint({ _id: 1 });
    if (after) cursor = cursor.min({ _id: after.id });
    const docs = await cursor.limit(after ? limit + 1 : limit).toArray();
    if (after && docs.length > 0 && sameBson(docs[0]!["_id"], after.id)) docs.shift();
    return docs.slice(0, limit);
  }

  /** The stored documents of these stored `_id`s, for the adoptions that `watchStorageChanges()` does again. */
  private async storedDocuments(ids: readonly unknown[]): Promise<Document[]> {
    const db = await this.database();
    const filter: Document = { _id: { $in: [...ids] } };
    return db.collection(this.collectionName).find(filter).toArray();
  }

  /**
   * The storage of the partition of a raw write and the id of its document, or undefined when
   * neither the documents of the event nor the stored `_id` tell them. The partition comes from
   * `form.partitionOf()` of the image before the change, else of the document after the write,
   * else of the stored `_id` (the order of `storageChangeOf()`). The document must not have a
   * partition field with another value.
   */
  private adoptionTarget(raw: RawStorageWrite): { storage: MongoDocumentStorage<T>; id: string } | undefined {
    const doc = raw.after ?? raw.before;
    if (!doc) return undefined;
    const places = new Set<string | undefined>();
    for (const source of [raw.before, raw.after, { _id: raw.storedId }]) if (isPlainObject(source)) places.add(this.form.partitionOf(source));
    for (const place of places) {
      if (place !== this.partition && (this.partition !== undefined || place === undefined)) continue;
      let storage: MongoDocumentStorage<T>;
      try {
        storage = place === this.partition ? this : this.forPartition(place as string);
      } catch {
        continue;
      }
      if (!storage.holds(doc)) continue;
      const fromId = this.form.idOf(raw.storedId, place);
      const key = raw.after?.[KEY] ?? raw.before?.[KEY];
      const id = typeof fromId === "string" ? fromId : typeof key === "string" ? key : undefined;
      if (id === undefined || id.includes(SEPARATOR)) continue;
      return { storage, id };
    }
    return undefined;
  }

  /** True when each partition field of a document has the value of this partition, or is absent (a raw replace can drop it). */
  private holds(doc: Document): boolean {
    for (const [name, value] of this.partitionEntries) {
      if (!(name in doc)) continue;
      if (value === undefined || !isDeepStrictEqual(doc[name], value)) return false;
    }
    return true;
  }

  /**
   * The storage fields and the partition fields that a raw write took from the document, for the
   * adoption to set again. No field of the item is in it.
   *
   * - The partition fields of this partition that the document does not have.
   * - `_key` (with `_kid`) of the image before the change. Without the image, `_key` only when
   *   `form.idOf()` does not tell the id, with `_kid`: the item keeps its `_id`, as a document from
   *   outside the storage.
   * - `_ord` of the image before the change, else `0`, the place of a document without `_ord`
   *   (the rule of the old documents).
   * - The names of `_kpf` of the image before the change that the document has with the value of
   *   the partition.
   */
  private restoredFields(raw: RawStorageWrite, after: Document, id: string): Document {
    const before = raw.before;
    const fields: Document = {};
    for (const [name, value] of this.partitionEntries) if (value !== undefined && !(name in after)) fields[name] = value;
    if (after[KEY] === undefined) {
      if (typeof before?.[KEY] === "string") {
        fields[KEY] = before[KEY];
        if (before[KEEP_ID] === true && after[KEEP_ID] === undefined) fields[KEEP_ID] = true;
      } else if (this.form.idOf(raw.storedId, this.partition) !== id) {
        fields[KEY] = id;
        if (after[KEEP_ID] === undefined) fields[KEEP_ID] = true;
      }
    }
    if (after[ORD] === undefined) fields[ORD] = typeof before?.[ORD] === "number" ? before[ORD] : 0;
    const kept = before?.[KEEP_PART];
    if (after[KEEP_PART] === undefined && Array.isArray(kept)) {
      const names = kept.filter((name): name is string => typeof name === "string" && this.partitionValues.has(name) && isDeepStrictEqual(after[name], this.partitionValues.get(name)));
      if (names.length > 0) fields[KEEP_PART] = names;
    }
    return fields;
  }

  /** The partitions that the storage knows: the floor documents of the counters, and the storages of `forPartition()`. */
  private async knownPartitions(): Promise<Array<string | undefined>> {
    const db = await this.database();
    const prefix = `floor${SEPARATOR}${this.collectionName}${SEPARATOR}`;
    const floors = await db
      .collection<CounterDoc>(this.countersName)
      .find({ _id: { $regex: `^${escapeRegex(prefix)}` } } as Filter<CounterDoc>, { projection: { _id: 1 } })
      .limit(MAX_KNOWN_PARTITIONS)
      .toArray();
    const found = new Set<string | undefined>(this.partitions.keys());
    for (const floor of floors) {
      const rest = String(floor._id).slice(prefix.length);
      found.add(rest === "" ? undefined : rest);
    }
    return [...found];
  }

  /**
   * The preconditions of a write (roadmap CLI-16), after a check of their ids. A storage without
   * `versionOf` throws a `TypeError` before the write starts.
   */
  private preconditions(expected: ReadonlyArray<readonly [string, string | null]>): ReadonlyArray<readonly [string, string | null]> {
    if (expected.length === 0) return expected;
    if (!this.options.versionOf) throw preconditionNotSupported(`The MongoDocumentStorage of the collection ${this.collectionName}`);
    for (const [id] of expected) this.storedId(id);
    return expected;
  }

  /** The current state of each id of the preconditions: the item, or no item for a tombstone or a missing document. */
  private async currentDocs(collection: Collection<Stored>, ids: readonly string[], session?: ClientSession): Promise<Map<string, Document>> {
    const docs = await collection
      .find({ ...this.partitionFilter(), _id: { $in: [...new Set(ids)].map((id) => this.storedId(id)) } } as Filter<Stored>, session ? { session } : {})
      .toArray();
    const byId = new Map<string, Document>();
    for (const doc of docs) {
      const id = this.idOfDoc(doc);
      if (id !== undefined) byId.set(id, doc);
    }
    return byId;
  }

  /** The current item of a stored document: no item for a tombstone or a missing document. */
  private currentOf(doc: Document | undefined): CurrentItem<T> {
    const entry = doc && doc[TOMB] !== true ? this.decode(doc) : undefined;
    return entry ? { found: true, value: entry[1] } : { found: false };
  }

  /**
   * This method tests the expected versions (roadmap CLI-16). A conflict throws
   * `VersionConflictError`. It gives the guard of each id for a write without a transaction: the
   * `_seq` that the test read, or no document. In a transaction, the guards are empty.
   */
  private async checkVersions(collection: Collection<Stored>, expected: ReadonlyArray<readonly [string, string | null]>, session?: ClientSession): Promise<Map<string, Document>> {
    const guards = new Map<string, Document>();
    if (expected.length === 0 || !this.options.versionOf) return guards;
    const versionOf = this.options.versionOf;
    const docs = await this.currentDocs(collection, expected.map(([id]) => id), session);
    const conflicts: VersionConflict[] = [];
    for (const [id, version] of expected) {
      const conflict = versionConflict(id, version, this.currentOf(docs.get(id)), versionOf);
      if (conflict) conflicts.push(conflict);
    }
    if (conflicts.length > 0) throw new VersionConflictError(conflicts);
    if (session) return guards;
    for (const [id] of expected) {
      const doc = docs.get(id);
      // A document without `_seq` (not written through the storage yet) keeps that state until the write
      guards.set(id, doc && typeof doc[SEQ] === "number" ? { [SEQ]: doc[SEQ] } : { [SEQ]: { $exists: false } });
    }
    return guards;
  }

  /**
   * The error of a guard that failed: another writer changed an id between the test and the write.
   * It has the current item of each id of the preconditions.
   */
  private async lateConflict(collection: Collection<Stored>, expected: ReadonlyArray<readonly [string, string | null]>): Promise<VersionConflictError> {
    const versionOf = this.options.versionOf!;
    const docs = await this.currentDocs(collection, expected.map(([id]) => id));
    const conflicts = expected.map(([id, version]): VersionConflict => {
      const current = this.currentOf(docs.get(id));
      const conflict = versionConflict(id, version, current, versionOf);
      if (conflict) return conflict;
      // The current item has the expected version again, after a write of another writer
      const now = current.found ? versionOf(current.value) : null;
      return current.found ? { id, expected: version, found: true, value: current.value, ...(now !== undefined && { version: now }) } : { id, expected: version, found: false, version: null };
    });
    return new VersionConflictError(conflicts, "Another writer changed an item between the test of its version and the write");
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
