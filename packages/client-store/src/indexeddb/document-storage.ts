/**
 * A collection storage in IndexedDB, for a browser (roadmap CLI-22).
 *
 * `IndexedDbStorage` keeps the items of one collection in one database of IndexedDB. It implements
 * `CollectionStorage`. Thus a `HybridStorage` of a browser app without SignalDB keeps its local copy
 * in it, and the items stay after a reload of the page (server stack D9).
 *
 * The database has two object stores:
 * - `items` has one record for each id, with the id as its key. The record of an item is
 *   `{ id, order, at, value }`. The record of a deleted id is a tombstone `{ id, deletedAt }`.
 * - `log` has one record: the epoch of the database and the counters of the change log.
 *
 * The rules:
 * - Each change takes the next number of the counter. `order` is the number of the first set of the
 *   id. The index `order` thus gives the entries in the order of the first set of each id, as a
 *   `Map` does. IndexedDB itself orders the records by their keys.
 * - `at` and `deletedAt` are the numbers of the last change of each id. Their indexes give a delta
 *   of `getChangesSince()` without a read of the items that did not change.
 * - Each write is one readwrite transaction: the reads, the test of the expected versions and the
 *   writes. Thus the writes of two tabs do not mix, a batch that fails changes nothing, and two
 *   patches at the same time keep each field.
 * - The storage checks each record that it reads. A record of another application or of another
 *   version is an error, not an item.
 * - Give each collection its own database. A database of one version has a fixed set of object
 *   stores: a new object store in an open database needs a version change, and the version change
 *   waits for the connections of the other tabs.
 */

import type {
  CollectionStorage,
  StorageBatchWriteOptions,
  StorageChangeBatch,
  StorageChangeEvent,
  StorageChanges,
  StorageItemWriteOptions,
  StorageMetadata,
  StorageObserver,
  StorageWriteOptions,
} from "@procedures/collections";
import { StorageListeners, type ListenerErrorHandler } from "@procedures/collections";
import {
  VersionConflictError,
  applyPatch,
  patchProblems,
  preconditionNotSupported,
  queryEntries,
  queryOptionsProblems,
  selectorProblems,
  versionConflicts,
  type CurrentItem,
  type StoragePatch,
  type StorageQueryOptions,
  type StorageQueryPolicy,
  type StorageSelector,
} from "@procedures/client/query";
import { IdbConnection, onResult, type IdbIndexLike, type IdbObjectStoreLike, type IdbStoreSchema, type IndexedDbOptions } from "./idb.js";

/** The options of an `IndexedDbStorage`. */
export interface IndexedDbStorageOptions<T = unknown> extends IndexedDbOptions {
  /**
   * The query policy of `query()` for a call without a policy: the operators and the limits. The
   * procedure `find` gives the policy of its host.
   * @default DEFAULT_QUERY_POLICY: no `$regex`
   */
  queryPolicy?: StorageQueryPolicy | undefined;
  /**
   * The version of an item, for example `(item) => item.rev` (roadmap CLI-16). With it, `set`,
   * `delete` and `setBatch` take an expected version: a write whose current item has another
   * version changes nothing and rejects with `VersionConflictError`. The test and the write are one
   * transaction, also for two tabs. Without it, a write with an expected version rejects with a
   * `TypeError`. Give the `versionOf` of the `HybridStorage` to its local copy.
   */
  versionOf?: ((item: T) => string | undefined) | undefined;
  /**
   * The number of deletes that the change log keeps (roadmap R28). After more deletes, the log
   * drops the oldest ones, and `getChangesSince` of an older version gives all items.
   * @default 10000
   */
  maxTombstones?: number;
  /**
   * The function that gets the error of an observer of `observe()`. The default throws the error
   * again in a microtask (`reportListenerError`). The write and the other observers do not fail.
   */
  onObserverError?: ListenerErrorHandler | undefined;
}

/** The names of the object stores, of their indexes and of the counter record. */
const ITEMS = "items";
const LOG = "log";
const COUNTER = "counter";
const ORDER = "order";
const AT = "at";
const DELETED_AT = "deletedAt";

/** The object stores of the database. A tombstone has no `order` and no `at`, so those indexes have only the items. */
const STORES: readonly IdbStoreSchema[] = [
  {
    name: ITEMS,
    options: { keyPath: "id" },
    indexes: [
      { name: ORDER, keyPath: ORDER, unique: true },
      { name: AT, keyPath: AT, unique: true },
      { name: DELETED_AT, keyPath: DELETED_AT, unique: true },
    ],
  },
  { name: LOG },
];

/** The record of an item. */
interface ItemRecord {
  readonly id: string;
  /** The number of the first set of the id: the place of the entry. */
  readonly order: number;
  /** The number of the last change of the id. */
  readonly at: number;
  readonly value: unknown;
}

/** The record of a deleted id, for the deletes of the change log. */
interface TombstoneRecord {
  readonly id: string;
  /** The number of the delete. */
  readonly deletedAt: number;
}

type StoredRecord = ItemRecord | TombstoneRecord;

/** The record of the object store `log`. */
interface Counter {
  /** The epoch of the database: a version of another database does not match it. */
  readonly epoch: string;
  /** The number of the last change. */
  seq: number;
  /** The log does not know the deletes at or below this number: they were dropped. */
  floor: number;
  /** The number of tombstones. */
  tombstones: number;
}

function isTombstone(record: StoredRecord): record is TombstoneRecord {
  return "deletedAt" in record;
}

/** True for a whole number of 0 or more. */
function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

/** The record of a raw value of the object store `items`, or undefined for a value of another form. */
function recordOf(raw: unknown): StoredRecord | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const record = raw as Partial<Record<"id" | "order" | "at" | "deletedAt" | "value", unknown>>;
  if (typeof record.id !== "string") return undefined;
  if ("deletedAt" in record) {
    const plain = !("order" in record) && !("at" in record) && !("value" in record);
    return plain && isCount(record.deletedAt) ? { id: record.id, deletedAt: record.deletedAt } : undefined;
  }
  return isCount(record.order) && isCount(record.at) && "value" in record ? { id: record.id, order: record.order, at: record.at, value: record.value } : undefined;
}

/** The counter of a raw value of the object store `log`, or undefined for a value of another form. */
function counterOf(raw: unknown): Counter | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const { epoch, seq, floor, tombstones } = raw as Partial<Record<keyof Counter, unknown>>;
  if (typeof epoch !== "string" || epoch === "" || !isCount(seq) || !isCount(floor) || !isCount(tombstones) || floor > seq) return undefined;
  return { epoch, seq, floor, tombstones };
}

/** A new epoch: a version of another database does not match it. */
function newEpoch(): string {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

/** The number of a version of the database, or undefined for another or an unknown version. */
function parseVersion(since: string | undefined, counter: Counter): number | undefined {
  if (since === undefined) return undefined;
  const separator = since.lastIndexOf(":");
  if (separator < 0 || since.slice(0, separator) !== counter.epoch) return undefined;
  const at = Number(since.slice(separator + 1));
  return Number.isInteger(at) && at >= 0 && at <= counter.seq ? at : undefined;
}

/** An id must be a string: the key of a record is its id. */
function checkId(id: unknown): string {
  if (typeof id !== "string") throw new TypeError(`An id must be a string, not ${typeof id}`);
  return id;
}

/** A change with the origin of the write, when the write has one. */
function withOrigin<T>(change: StorageChangeEvent<T>, origin: string | undefined): StorageChangeEvent<T> {
  return origin === undefined ? change : { ...change, origin };
}

/**
 * The writes of one transaction. It knows the records that the transaction read, so a second write
 * of an id in the same batch sees the first one. Each change takes the next number of the counter.
 */
class Writer<T> {
  /** The changes for the observers, in the order of the writes. */
  readonly changes: Array<StorageChangeEvent<T>> = [];

  constructor(
    private readonly items: IdbObjectStoreLike,
    private readonly counter: Counter,
    private readonly records: Map<string, StoredRecord | undefined>,
    private readonly live: readonly ItemRecord[],
    private readonly origin: string | undefined,
  ) {}

  /** The current item of an id that the transaction read. */
  current(id: string): CurrentItem<T> {
    const record = this.recordOf(id);
    return record !== undefined && !isTombstone(record) ? { found: true, value: record.value as T } : { found: false };
  }

  /** This method writes an item. An existing id keeps its place in the order of the entries. */
  set(id: string, value: T): void {
    const before = this.recordOf(id);
    const at = ++this.counter.seq;
    if (before !== undefined && isTombstone(before)) this.counter.tombstones = Math.max(0, this.counter.tombstones - 1);
    const record: ItemRecord = { id, order: before !== undefined && !isTombstone(before) ? before.order : at, at, value };
    this.items.put(record);
    this.records.set(id, record);
    this.changes.push(withOrigin<T>({ type: "set", id, value }, this.origin));
  }

  /** This method deletes the item of an id, and keeps a tombstone for the change log. True when the item existed. */
  delete(id: string): boolean {
    const before = this.recordOf(id);
    if (before === undefined || isTombstone(before)) return false;
    const record: TombstoneRecord = { id, deletedAt: ++this.counter.seq };
    this.items.put(record);
    this.counter.tombstones++;
    this.records.set(id, record);
    this.changes.push(withOrigin<T>({ type: "delete", id }, this.origin));
    return true;
  }

  /** This method deletes each item, in the order of the entries. */
  clear(): void {
    for (const { id } of this.live) {
      const record: TombstoneRecord = { id, deletedAt: ++this.counter.seq };
      this.items.put(record);
      this.counter.tombstones++;
    }
    if (this.live.length > 0) this.changes.push(withOrigin<T>({ type: "clear" }, this.origin));
  }

  private recordOf(id: string): StoredRecord | undefined {
    if (!this.records.has(id)) throw new Error(`The transaction did not read the id ${JSON.stringify(id)}`);
    return this.records.get(id);
  }
}

/**
 * A collection storage in IndexedDB, for a browser (roadmap CLI-22).
 *
 * - The items stay after `close()` and after a reload of the page. A new storage of the same
 *   database reads them, and the versions of `getChangesSince()` stay valid.
 * - Each write takes a copy of its value (`structuredClone`), and each read gives a new copy.
 * - `query()` runs a selector, `observe()` tells each change of this storage with the origin of its
 *   write, and `patch()` changes an item in one transaction.
 * - `observe()` does not tell the writes of another tab or of another storage of the same database.
 * - After `close()`, each operation rejects, and a second `close()` does nothing.
 *
 * @example
 * ```typescript
 * import { ApiStorage, HybridStorage } from "@procedures/store/browser";
 * import { IndexedDbQueueStore, IndexedDbStorage, IndexedDbSyncStateStore } from "@procedures/store/indexeddb";
 *
 * const users = new HybridStorage(new ApiStorage(client, { collection: "users" }), {
 *   local: new IndexedDbStorage("users"),
 *   queueStore: new IndexedDbQueueStore("users-queue"),
 *   syncState: new IndexedDbSyncStateStore("users-sync"),
 * });
 * ```
 */
export class IndexedDbStorage<T> implements CollectionStorage<T> {
  private readonly connection: IdbConnection;
  private readonly maxTombstones: number;
  /** The query policy of a call without a policy */
  private readonly queryPolicy: StorageQueryPolicy | undefined;
  /** The version of an item, for the preconditions of the writes (roadmap CLI-16) */
  private readonly versionOf: ((item: T) => string | undefined) | undefined;
  /** The observers of `observe()` */
  private readonly observers: StorageListeners<StorageChangeBatch<T>>;
  private closed = false;

  /**
   * @param name - The name of the database: one database for each collection. The storage makes it at the first operation.
   * @param options - The IndexedDB factory, the query policy, `versionOf` and the limit of the change log.
   */
  constructor(name: string, options: IndexedDbStorageOptions<T> = {}) {
    if (typeof name !== "string" || name === "") throw new TypeError("IndexedDbStorage needs the name of a database");
    this.connection = new IdbConnection(name, STORES, options.indexedDB, (store) => {
      const counter: Counter = { epoch: newEpoch(), seq: 0, floor: 0, tombstones: 0 };
      store(LOG).put(counter, COUNTER);
    });
    this.maxTombstones = Math.max(0, options.maxTombstones ?? 10_000);
    this.queryPolicy = options.queryPolicy;
    this.versionOf = options.versionOf;
    this.observers = new StorageListeners<StorageChangeBatch<T>>(options.onObserverError);
  }

  /** The name of the database. */
  get name(): string {
    return this.connection.database;
  }

  //
  // ═══ Read Operations ═══
  //

  async get(id: string): Promise<T | undefined> {
    this.checkOpen();
    checkId(id);
    return this.connection.transaction("readonly", [ITEMS], (transaction) => {
      const request = transaction.objectStore(ITEMS).get(id);
      return () => {
        const record = this.storedRecord(request.result, id);
        return record === undefined || isTombstone(record) ? undefined : (record.value as T);
      };
    });
  }

  async getAll(): Promise<T[]> {
    return (await this.liveRecords()).map((record) => record.value as T);
  }

  /** Every item with its id, in the order of the first set of each id. */
  async getEntries(): Promise<Array<[string, T]>> {
    return (await this.liveRecords()).map((record): [string, T] => [record.id, record.value as T]);
  }

  /** The ids of the items, in the order of the entries. The storage does not read the values. */
  async getIds(): Promise<string[]> {
    this.checkOpen();
    return this.connection.transaction("readonly", [ITEMS], (transaction) => {
      const request = transaction.objectStore(ITEMS).index(ORDER).getAllKeys();
      return () =>
        request.result.map((key, index) => {
          if (typeof key !== "string") throw this.problem(`a record whose key is not a string (record ${index + 1})`);
          return key;
        });
    });
  }

  /**
   * The changes after a version (roadmap R28). A version of another database, or older than the
   * dropped deletes, gives all items (`full: true`) in the order of the entries. A delta gives the
   * changed items and the deleted ids in the order of the last change of each id. The reads run in
   * one transaction, and a version stays valid after a reload.
   */
  async getChangesSince(since?: string): Promise<StorageChanges<T>> {
    this.checkOpen();
    return this.connection.transaction("readonly", [ITEMS, LOG], (transaction, fail) => {
      const items = transaction.objectStore(ITEMS);
      let version = "";
      let full: Array<[string, T]> | undefined;
      const changed: Array<[string, T]> = [];
      const deleted: string[] = [];
      onResult(transaction.objectStore(LOG).get(COUNTER), fail, (raw) => {
        const counter = this.counter(raw);
        version = `${counter.epoch}:${counter.seq}`;
        const from = parseVersion(since, counter);
        if (from === undefined || from < counter.floor) {
          onResult(items.index(ORDER).getAll(), fail, (records) => {
            full = records.map((value, index): [string, T] => {
              const record = this.liveRecord(value, index);
              return [record.id, record.value as T];
            });
          });
          return;
        }
        // The newest change first, until the version: the reads skip the items that did not change
        this.scanAfter(items.index(AT), fail, (value) => {
          const record = this.liveRecord(value, changed.length);
          if (record.at <= from) return false;
          changed.push([record.id, record.value as T]);
          return true;
        });
        this.scanAfter(items.index(DELETED_AT), fail, (value) => {
          const record = recordOf(value);
          if (record === undefined || !isTombstone(record)) throw this.problem(`a record that is not a tombstone of an IndexedDbStorage (tombstone ${deleted.length + 1})`);
          if (record.deletedAt <= from) return false;
          deleted.push(record.id);
          return true;
        });
      });
      return (): StorageChanges<T> =>
        full !== undefined ? { version, full: true, changed: full, deleted: [] } : { version, full: false, changed: changed.reverse(), deleted: deleted.reverse() };
    });
  }

  /** The items for which the predicate gives true, in the order of the entries. The predicate gets a copy of each item. */
  async find(predicate: (item: T) => boolean): Promise<T[]> {
    return (await this.getAll()).filter((item) => predicate(item));
  }

  /**
   * The entries whose items match the selector, with the order, the skip and the limit of
   * `queryEntries()`, under the policy of the call or of the options. A query that is not correct
   * rejects with a `TypeError` before the storage reads the database.
   */
  async query(selector: StorageSelector, options?: StorageQueryOptions, policy?: StorageQueryPolicy): Promise<Array<[string, T]>> {
    this.checkOpen();
    const limits = policy ?? this.queryPolicy;
    const problems = [...selectorProblems(selector, limits), ...queryOptionsProblems(options, limits)];
    if (problems.length > 0) throw new TypeError(`The query is not correct: ${problems.join(". ")}`);
    return queryEntries(await this.getEntries(), selector, options, limits);
  }

  /**
   * This method starts to send the changes of each write of this storage to the observer, before the
   * write resolves. The observers share each batch. The writes of another tab do not give a batch.
   */
  observe(observer: StorageObserver<T>): () => void {
    this.checkOpen();
    return this.observers.add(observer);
  }

  async has(id: string): Promise<boolean> {
    this.checkOpen();
    checkId(id);
    return this.connection.transaction("readonly", [ITEMS], (transaction) => {
      const request = transaction.objectStore(ITEMS).get(id);
      return () => {
        const record = this.storedRecord(request.result, id);
        return record !== undefined && !isTombstone(record);
      };
    });
  }

  async size(): Promise<number> {
    this.checkOpen();
    return this.connection.transaction("readonly", [ITEMS], (transaction) => {
      const request = transaction.objectStore(ITEMS).index(ORDER).count();
      return () => request.result;
    });
  }

  //
  // ═══ Write Operations ═══
  //

  async set(id: string, value: T, options?: StorageItemWriteOptions): Promise<void> {
    this.checkOpen();
    checkId(id);
    const expected = this.preconditions(options?.expectedVersion === undefined ? [] : [[id, options.expectedVersion]]);
    const stored = structuredClone(value);
    await this.write([id], false, options?.origin, (writer) => {
      this.checkVersions(writer, expected);
      writer.set(id, stored);
    });
  }

  async delete(id: string, options?: StorageItemWriteOptions): Promise<boolean> {
    this.checkOpen();
    checkId(id);
    const expected = this.preconditions(options?.expectedVersion === undefined ? [] : [[id, options.expectedVersion]]);
    return this.write([id], false, options?.origin, (writer) => {
      this.checkVersions(writer, expected);
      return writer.delete(id);
    });
  }

  /** This method deletes each item. The change log gets a delete of each id, in the order of the entries. */
  async clear(options?: StorageWriteOptions): Promise<void> {
    this.checkOpen();
    await this.write([], true, options?.origin, (writer) => writer.clear());
  }

  /**
   * This method changes the item of the id in one transaction (a JSON Merge Patch, or the operations
   * `$set`, `$unset`, `$remove` and `$insert`), and gives a copy of the new item. A missing id stays
   * missing, and the result is undefined. A patch that cannot apply to the item changes nothing.
   */
  async patch(id: string, fields: StoragePatch, options?: StorageWriteOptions): Promise<T | undefined> {
    this.checkOpen();
    checkId(id);
    const [problem] = patchProblems(fields);
    if (problem !== undefined) throw new TypeError(`The patch of ${JSON.stringify(id)} is not correct: ${problem}`);
    const result = await this.write([id], false, options?.origin, (writer) => {
      const current = writer.current(id);
      if (!current.found) return undefined;
      const next = applyPatch(current.value, fields) as unknown as T;
      writer.set(id, next);
      return next;
    });
    // The observers got the new item: the caller gets its own copy
    return result !== undefined && this.observers.size > 0 ? structuredClone(result) : result;
  }

  //
  // ═══ Bulk Operations ═══
  //

  /**
   * This method sets several items in one transaction. When one value has no copy, or one expected
   * version has a conflict, nothing changes.
   */
  async setBatch(items: Array<[string, T]>, options?: StorageBatchWriteOptions): Promise<void> {
    this.checkOpen();
    for (const [id] of items) checkId(id);
    const expected = this.preconditions(options?.expectedVersions ?? []);
    const copies = items.map(([id, value]): [string, T] => [id, structuredClone(value)]);
    if (copies.length === 0 && expected.length === 0) return;
    const ids = [...copies.map(([id]) => id), ...expected.map(([id]) => id)];
    await this.write(ids, false, options?.origin, (writer) => {
      this.checkVersions(writer, expected);
      for (const [id, value] of copies) writer.set(id, value);
    });
  }

  /** This method deletes several items in one transaction. */
  async deleteBatch(ids: string[], options?: StorageWriteOptions): Promise<number> {
    this.checkOpen();
    for (const id of ids) checkId(id);
    if (ids.length === 0) return 0;
    return this.write(ids, false, options?.origin, (writer) => {
      let deleted = 0;
      for (const id of ids) if (writer.delete(id)) deleted++;
      return deleted;
    });
  }

  async getBatch(ids: string[]): Promise<Map<string, T>> {
    this.checkOpen();
    for (const id of ids) checkId(id);
    if (ids.length === 0) return new Map();
    return this.connection.transaction("readonly", [ITEMS], (transaction) => {
      const store = transaction.objectStore(ITEMS);
      const requests = [...new Set(ids)].map((id) => [id, store.get(id)] as const);
      return () => {
        const result = new Map<string, T>();
        for (const [id, request] of requests) {
          const record = this.storedRecord(request.result, id);
          if (record !== undefined && !isTombstone(record)) result.set(id, record.value as T);
        }
        return result;
      };
    });
  }

  //
  // ═══ Lifecycle & Metadata ═══
  //

  /**
   * This method closes the database. The items stay in it: a new storage of the same database reads
   * them. After `close()`, each operation rejects, and a second `close()` does nothing.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.observers.clear();
    await this.connection.close();
  }

  async getMetadata(): Promise<StorageMetadata> {
    const size = await this.size();
    return { type: "custom", size, stats: { backend: "indexeddb", database: this.name } };
  }

  //
  // ═══ Internal Helpers ═══
  //

  /** This method throws after `close()`. In an async method, the throw rejects the promise. */
  private checkOpen(): void {
    if (this.closed) throw new Error(`The IndexedDbStorage ${this.name} is closed`);
  }

  private problem(what: string): Error {
    return new Error(`The IndexedDB database ${this.name} has ${what}`);
  }

  /** The record of an id, or undefined for no record. A record of another form throws. */
  private storedRecord(raw: unknown, id: string): StoredRecord | undefined {
    if (raw === undefined) return undefined;
    const record = recordOf(raw);
    if (record === undefined || record.id !== id) throw this.problem(`a record that is not an item of an IndexedDbStorage (id ${JSON.stringify(id)})`);
    return record;
  }

  /** The records of the items, in the order of the entries. */
  private async liveRecords(): Promise<ItemRecord[]> {
    this.checkOpen();
    return this.connection.transaction("readonly", [ITEMS], (transaction) => {
      const request = transaction.objectStore(ITEMS).index(ORDER).getAll();
      return () => request.result.map((value, index) => this.liveRecord(value, index));
    });
  }

  /** The record of an entry of the index `order` or `at`. A record of another form throws. */
  private liveRecord(raw: unknown, index: number): ItemRecord {
    const record = recordOf(raw);
    if (record === undefined || isTombstone(record)) throw this.problem(`a record that is not an item of an IndexedDbStorage (record ${index + 1})`);
    return record;
  }

  /** The counter of the object store `log`. A missing counter or a counter of another form throws. */
  private counter(raw: unknown): Counter {
    const counter = counterOf(raw);
    if (counter === undefined) throw this.problem("no counter of an IndexedDbStorage in its object store log");
    return counter;
  }

  /** This method reads the records of an index from the highest key, while `take` gives true. */
  private scanAfter(index: IdbIndexLike, fail: (error: unknown) => void, take: (value: unknown) => boolean): void {
    onResult(index.openCursor(null, "prev"), fail, (cursor) => {
      if (cursor !== null && take(cursor.value)) cursor.continue();
    });
  }

  /**
   * The preconditions of a write. A storage without `versionOf` throws a `TypeError` before the
   * write starts (roadmap CLI-16).
   */
  private preconditions(expected: ReadonlyArray<readonly [string, string | null]>): ReadonlyArray<readonly [string, string | null]> {
    if (expected.length === 0) return expected;
    if (!this.versionOf) throw preconditionNotSupported("This IndexedDbStorage");
    for (const [id] of expected) checkId(id);
    return expected;
  }

  /**
   * This method tests the expected versions in the transaction of the write (roadmap CLI-16). A
   * conflict throws `VersionConflictError`, and the transaction aborts.
   */
  private checkVersions(writer: Writer<T>, expected: ReadonlyArray<readonly [string, string | null]>): void {
    if (expected.length === 0 || !this.versionOf) return;
    const conflicts = versionConflicts(expected, (id) => writer.current(id), this.versionOf);
    if (conflicts.length > 0) throw new VersionConflictError(conflicts);
  }

  /**
   * One write in one readwrite transaction. The transaction reads the records of the ids, every
   * item when `all` is true, and the counter. Then `change` writes with a `Writer`, the change log
   * drops the oldest tombstones above the limit, and the counter is written. The observers get the
   * changes after the commit, before the promise resolves. A throw of `change` aborts the
   * transaction, and the promise rejects with its error.
   */
  private async write<R>(ids: readonly string[], all: boolean, origin: string | undefined, change: (writer: Writer<T>) => R): Promise<R> {
    const outcome = await this.connection.transaction("readwrite", [ITEMS, LOG], (transaction, fail) => {
      const items = transaction.objectStore(ITEMS);
      const log = transaction.objectStore(LOG);
      const reads = [...new Set(ids)].map((id) => [id, items.get(id)] as const);
      const every = all ? items.index(ORDER).getAll() : undefined;
      let done: { readonly value: R; readonly changes: Array<StorageChangeEvent<T>> } | undefined;
      // The requests of a transaction run in order: the reads before it have their results here
      onResult(log.get(COUNTER), fail, (raw) => {
        const counter = this.counter(raw);
        const records = new Map<string, StoredRecord | undefined>();
        for (const [id, request] of reads) records.set(id, this.storedRecord(request.result, id));
        const live = every ? every.result.map((value, index) => this.liveRecord(value, index)) : [];
        const writer = new Writer<T>(items, counter, records, live, origin);
        done = { value: change(writer), changes: writer.changes };
        if (writer.changes.length === 0) return;
        this.trim(items, counter, fail, () => log.put(counter, COUNTER));
      });
      return () => {
        if (!done) throw new Error(`The write to the IndexedDB database ${this.name} did not run`);
        return done;
      };
    });
    if (outcome.changes.length > 0 && this.observers.size > 0) this.observers.emit(outcome.changes);
    return outcome.value;
  }

  /** This method drops the oldest tombstones above the limit, moves the floor of the change log, then calls `then`. */
  private trim(items: IdbObjectStoreLike, counter: Counter, fail: (error: unknown) => void, then: () => void): void {
    const excess = counter.tombstones - this.maxTombstones;
    if (excess <= 0) {
      then();
      return;
    }
    onResult(items.index(DELETED_AT).getAll(null, excess), fail, (records) => {
      records.forEach((value, index) => {
        const record = recordOf(value);
        if (record === undefined || !isTombstone(record)) throw this.problem(`a record that is not a tombstone of an IndexedDbStorage (tombstone ${index + 1})`);
        items.delete(record.id);
        counter.floor = Math.max(counter.floor, record.deletedAt);
        counter.tombstones = Math.max(0, counter.tombstones - 1);
      });
      then();
    });
  }
}
