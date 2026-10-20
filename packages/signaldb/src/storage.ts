/**
 * A collection storage over the SignalDB collection of an app (roadmap CLI-23, server stack D9).
 *
 * The app owns the SignalDB `Collection`: its persistence, its indexes, its cursors and its
 * reactivity. `SignalDbStorage` reads and writes the items of that collection through the
 * `CollectionStorage` contract. Thus the collection is the local copy of a `HybridStorage`, and
 * the `HybridStorage` owns the sync: the queue, the sync state and the remote.
 *
 * The rules:
 * - Each operation waits for the load of the persistence of the collection (`isReady()`). A failed
 *   load does not stop the storage: the collection then keeps its items in memory, as SignalDB does.
 * - A write of SignalDB is synchronous. Each write of the storage reads, tests and writes in one
 *   synchronous step, so two writes never mix: a patch and a precondition are atomic.
 * - A write of several items runs in one `batch()` of the collection: the indexes and the cursors
 *   update one time. The validators of the collection examine each item before the first write, so
 *   an item that a validator refuses changes nothing.
 * - Each write takes a copy of its value, and each read gives a new copy. A cursor of SignalDB gives
 *   copies (`structuredClone`) of the items, and the storage reads only through cursors.
 * - `observe()` gives the batches of the writes of the storage, with their origins. It also gives
 *   each change that the app makes directly on the collection: one batch for each change, with no
 *   origin. Thus a `HybridStorage` with `capture: "observe"` sends the writes of the app.
 * - `query()` runs `queryEntries()` on the values. It does not give the selector to SignalDB:
 *   SignalDB runs Mongo selectors on the items (with `mingo`), and the contract needs the
 *   language of the client on the values.
 * - `close()` stops the storage. The collection stays open, with its items: the app disposes it.
 *
 * The limits:
 * - A load of the persistence (`persistence.received`) changes the items without the events of a
 *   change. `observe()` thus does not tell it. The order of the entries after a load is the order of
 *   the persistence adapter.
 * - The collection must not have a `transform`: the storage reads the items through cursors.
 * - Each id is a string. An item of the collection whose `id` is not a string is an error.
 * - The storage keeps no change log, so it has no `getChangesSince()`. A cursor copies each item,
 *   so the storage has no cheap `getIds()` either.
 */

import type { Collection } from "@signaldb/core";
import type {
  CollectionStorage,
  StorageBatchWriteOptions,
  StorageChangeBatch,
  StorageChangeEvent,
  StorageItemWriteOptions,
  StorageMetadata,
  StorageObserver,
  StorageWriteOptions,
} from "@procedures/collections";
import { StorageListeners, reportListenerError, type ListenerErrorHandler } from "@procedures/collections";
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
import { documentCodec, isPlainObject, type SignalDbItem, type SignalDbItemCodec } from "./codec.js";

/**
 * A SignalDB collection of any item type. The storage reads the items as they are in memory, so the
 * collection must not have a `transform`.
 */
export type SignalDbCollection = Collection<any, any, any, any>;

/** The options of a `SignalDbStorage`. */
export interface SignalDbStorageOptions<T = unknown> {
  /**
   * The change of a value to an item of the collection and back.
   * @default documentCodec(): a document whose `id` is its key is the item, and each other value goes into an envelope
   */
  codec?: SignalDbItemCodec<T> | undefined;
  /**
   * The query policy of `query()` for a call without a policy: the operators and the limits. The
   * procedure `find` gives the policy of its host.
   * @default DEFAULT_QUERY_POLICY: no `$regex`
   */
  queryPolicy?: StorageQueryPolicy | undefined;
  /**
   * The version of a value, for example `(item) => item.rev` (roadmap CLI-16). With it, `set`,
   * `delete` and `setBatch` take an expected version: a write whose current value has another
   * version changes nothing and rejects with `VersionConflictError`. Without it, a write with an
   * expected version rejects with a `TypeError`. Give the `versionOf` of the `HybridStorage` to its
   * local copy.
   */
  versionOf?: ((item: T) => string | undefined) | undefined;
  /**
   * The function that gets the error of an observer of `observe()`, and the error of a change of
   * the app that the storage cannot read. The default throws the error again in a microtask
   * (`reportListenerError`). The write and the other observers do not fail.
   */
  onObserverError?: ListenerErrorHandler | undefined;
}

/** The options of the reads: no reactivity and no field tracking, also in a reactive scope of the app. */
const READ = { reactive: false, fieldTracking: false } as const;

/** An id must be a string: it is the key of an item. */
function checkId(id: unknown): string {
  if (typeof id !== "string") throw new TypeError(`An id must be a string, not ${typeof id}`);
  return id;
}

/** A change with the origin of the write, when the write has one. */
function withOrigin<T>(change: StorageChangeEvent<T>, origin: string | undefined): StorageChangeEvent<T> {
  return origin === undefined ? change : { ...change, origin };
}

/** A value and its item, for a write. */
interface Prepared<T> {
  readonly id: string;
  /** The copy of the value that the write took */
  readonly value: T;
  readonly item: SignalDbItem;
}

/**
 * A collection storage over the SignalDB collection of an app (roadmap CLI-23).
 *
 * - The collection keeps the items. The storage keeps nothing of its own, and a new storage of the
 *   same collection reads the same items.
 * - `observe()` tells the writes of the storage and the changes that the app makes on the collection.
 * - `query()` runs a selector, and `patch()` changes an item in one step.
 * - After `close()`, each operation rejects, and a second `close()` does nothing.
 *
 * @example
 * ```typescript
 * import { Collection } from "@signaldb/core";
 * import { ApiStorage, HybridStorage } from "@procedures/store/browser";
 * import { SignalDbStorage } from "@procedures/signaldb";
 *
 * const todos = new Collection<Todo>({ persistence: createIndexedDBAdapter("todos") });
 * const storage = new HybridStorage<Todo>(new ApiStorage(client, { collection: "todos" }), {
 *   mode: "write-back",
 *   local: new SignalDbStorage<Todo>(todos),
 *   capture: "observe",
 * });
 * todos.insert({ id: "t1", title: "Write the docs" }); // the storage sends it to the server
 * ```
 */
export class SignalDbStorage<T> implements CollectionStorage<T> {
  private readonly collection: SignalDbCollection;
  private readonly codec: SignalDbItemCodec<T>;
  /** The query policy of a call without a policy */
  private readonly queryPolicy: StorageQueryPolicy | undefined;
  /** The version of a value, for the preconditions of the writes (roadmap CLI-16) */
  private readonly versionOf: ((item: T) => string | undefined) | undefined;
  private readonly onObserverError: ListenerErrorHandler;
  /** The observers of `observe()` */
  private readonly observers: StorageListeners<StorageChangeBatch<T>>;
  /** The load of the persistence of the collection. A failed load also resolves. */
  private readonly ready: Promise<void>;
  /** True while a write of this storage runs: its events are not changes of the app */
  private writing = false;
  /** True while the storage listens to the events of the collection */
  private listening = false;
  private closed = false;

  /**
   * @param collection - The SignalDB collection of the app. The app owns it, and `close()` does not dispose it.
   * @param options - The codec, the query policy, `versionOf` and the handler of the errors of the observers.
   */
  constructor(collection: SignalDbCollection, options: SignalDbStorageOptions<T> = {}) {
    if (typeof collection?.find !== "function" || typeof collection.replaceOne !== "function" || typeof collection.on !== "function") {
      throw new TypeError("SignalDbStorage needs a SignalDB Collection");
    }
    this.collection = collection;
    this.codec = options.codec ?? documentCodec<T>();
    this.queryPolicy = options.queryPolicy;
    this.versionOf = options.versionOf;
    this.onObserverError = options.onObserverError ?? reportListenerError;
    this.observers = new StorageListeners<StorageChangeBatch<T>>(this.onObserverError);
    // The collection still operates in memory after a failed load: the app gets `persistence.error`
    this.ready = collection.isReady().then(
      () => undefined,
      () => undefined,
    );
  }

  /** The name of the collection. */
  get name(): string {
    return this.collection.name;
  }

  //
  // ═══ Read Operations ═══
  //

  async get(id: string): Promise<T | undefined> {
    this.checkOpen();
    checkId(id);
    await this.whenReady();
    const current = this.current(id);
    return current.found ? current.value : undefined;
  }

  async getAll(): Promise<T[]> {
    return (await this.getEntries()).map(([, value]) => value);
  }

  /** Every item with its id, in the order of the collection: the order of the first set of each id. */
  async getEntries(): Promise<Array<[string, T]>> {
    this.checkOpen();
    await this.whenReady();
    return this.collection
      .find({}, READ)
      .fetch()
      .map((raw: unknown, index: number) => this.entryOf(raw, index));
  }

  /** The items for which the predicate gives true, in the order of the entries. The predicate gets a copy of each item. */
  async find(predicate: (item: T) => boolean): Promise<T[]> {
    return (await this.getAll()).filter((item) => predicate(item));
  }

  /**
   * The entries whose values match the selector, with the order, the skip and the limit of
   * `queryEntries()`, under the policy of the call or of the options. A query that is not correct
   * rejects with a `TypeError` before the storage reads the collection.
   */
  async query(selector: StorageSelector, options?: StorageQueryOptions, policy?: StorageQueryPolicy): Promise<Array<[string, T]>> {
    this.checkOpen();
    const limits = policy ?? this.queryPolicy;
    const problems = [...selectorProblems(selector, limits), ...queryOptionsProblems(options, limits)];
    if (problems.length > 0) throw new TypeError(`The query is not correct: ${problems.join(". ")}`);
    return queryEntries(await this.getEntries(), selector, options, limits);
  }

  /**
   * This method starts to send the changes of the collection to the observer.
   *
   * - A write of this storage gives one batch, with the origin of its options, before the write resolves.
   * - A change that the app makes directly on the collection gives one batch with one change and no
   *   origin, at once: `insert`, `updateOne`, `replaceOne` and `removeOne`, for example.
   * - The observers share each batch. A load of the persistence gives no batch.
   *
   * @returns The function that stops the batches. A second use of it does nothing.
   * @throws Error after `close()`
   */
  observe(observer: StorageObserver<T>): () => void {
    this.checkOpen();
    const remove = this.observers.add(observer);
    this.listen();
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      remove();
      if (this.observers.size === 0) this.unlisten();
    };
  }

  async has(id: string): Promise<boolean> {
    this.checkOpen();
    checkId(id);
    await this.whenReady();
    return this.collection.find({ id }, READ).count() > 0;
  }

  async size(): Promise<number> {
    this.checkOpen();
    await this.whenReady();
    return this.collection.find({}, READ).count();
  }

  //
  // ═══ Write Operations ═══
  //

  async set(id: string, value: T, options?: StorageItemWriteOptions): Promise<void> {
    this.checkOpen();
    checkId(id);
    const expected = this.preconditions(options?.expectedVersion === undefined ? [] : [[id, options.expectedVersion]]);
    const write = this.prepare(id, value);
    await this.whenReady();
    this.write(options?.origin, (changes) => {
      this.checkVersions(expected);
      this.put(write, changes);
    });
  }

  async delete(id: string, options?: StorageItemWriteOptions): Promise<boolean> {
    this.checkOpen();
    checkId(id);
    const expected = this.preconditions(options?.expectedVersion === undefined ? [] : [[id, options.expectedVersion]]);
    await this.whenReady();
    return this.write(options?.origin, (changes) => {
      this.checkVersions(expected);
      return this.remove(id, changes);
    });
  }

  /** This method deletes each item of the collection in one batch. A collection with items gives one `clear` change. */
  async clear(options?: StorageWriteOptions): Promise<void> {
    this.checkOpen();
    await this.whenReady();
    this.write(options?.origin, (changes) => {
      let removed = 0;
      this.batch(() => {
        removed = this.collection.removeMany({});
      });
      if (removed > 0) changes.push({ type: "clear" });
    });
  }

  /**
   * This method changes the item of the id in one step (a JSON Merge Patch, or the operations
   * `$set`, `$unset`, `$remove` and `$insert`), and gives a copy of the new item. A missing id stays
   * missing, and the result is undefined.
   */
  async patch(id: string, fields: StoragePatch, options?: StorageWriteOptions): Promise<T | undefined> {
    this.checkOpen();
    checkId(id);
    const [problem] = patchProblems(fields);
    if (problem !== undefined) throw new TypeError(`The patch of ${JSON.stringify(id)} is not correct: ${problem}`);
    // A copy: a change of the fields during the wait does not change the patch
    const own = structuredClone(fields);
    await this.whenReady();
    return this.write(options?.origin, (changes) => {
      const current = this.current(id);
      if (!current.found) return undefined;
      const next = applyPatch(current.value, own) as unknown as T;
      this.put({ id, value: next, item: this.itemOf(id, next) }, changes);
      // The collection keeps `next`: the caller gets its own copy
      return structuredClone(next);
    });
  }

  //
  // ═══ Bulk Operations ═══
  //

  /**
   * This method sets several items in one batch of the collection. When one expected version has a
   * conflict, or a validator of the collection refuses one item, nothing changes.
   */
  async setBatch(items: Array<[string, T]>, options?: StorageBatchWriteOptions): Promise<void> {
    this.checkOpen();
    for (const [id] of items) checkId(id);
    const expected = this.preconditions(options?.expectedVersions ?? []);
    const writes = items.map(([id, value]) => this.prepare(id, value));
    if (writes.length === 0 && expected.length === 0) return;
    await this.whenReady();
    this.write(options?.origin, (changes) => {
      this.checkVersions(expected);
      // The validators of the app refuse an item before the first write, so a refusal changes nothing
      if (writes.length > 1) for (const { item } of writes) this.collection.emit("validate", item);
      this.batch(() => {
        for (const write of writes) this.put(write, changes);
      });
    });
  }

  /** This method deletes several items in one batch of the collection. */
  async deleteBatch(ids: string[], options?: StorageWriteOptions): Promise<number> {
    this.checkOpen();
    for (const id of ids) checkId(id);
    if (ids.length === 0) return 0;
    await this.whenReady();
    return this.write(options?.origin, (changes) => {
      let deleted = 0;
      this.batch(() => {
        for (const id of new Set(ids)) if (this.remove(id, changes)) deleted++;
      });
      return deleted;
    });
  }

  async getBatch(ids: string[]): Promise<Map<string, T>> {
    this.checkOpen();
    for (const id of ids) checkId(id);
    await this.whenReady();
    const result = new Map<string, T>();
    for (const id of new Set(ids)) {
      const current = this.current(id);
      if (current.found) result.set(id, current.value);
    }
    return result;
  }

  //
  // ═══ Lifecycle & Metadata ═══
  //

  /**
   * This method stops the storage. The collection stays open, with its items: a new storage of the
   * collection reads them. After `close()`, each operation rejects, and a second `close()` does nothing.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.observers.clear();
    this.unlisten();
  }

  async getMetadata(): Promise<StorageMetadata> {
    const size = await this.size();
    return { type: "custom", size, stats: { backend: "signaldb", collection: this.name } };
  }

  //
  // ═══ Internal Helpers ═══
  //

  /** This method throws after `close()`. In an async method, the throw rejects the promise. */
  private checkOpen(): void {
    if (this.closed) throw new Error(`The SignalDbStorage of the collection ${this.name} is closed`);
  }

  /** This method waits for the load of the persistence. A close during the wait rejects. */
  private async whenReady(): Promise<void> {
    await this.ready;
    this.checkOpen();
  }

  private problem(what: string): Error {
    return new Error(`The SignalDB collection ${this.name} has ${what}`);
  }

  /** The id and the value of an item that a cursor gave. An item without a string id throws. */
  private entryOf(raw: unknown, index: number): [string, T] {
    if (!isPlainObject(raw) || typeof raw["id"] !== "string") throw this.problem(`an item without a string id (item ${index + 1})`);
    return [raw["id"], this.codec.fromItem(raw as SignalDbItem)];
  }

  /** The current value of an id: a copy. */
  private current(id: string): CurrentItem<T> {
    const raw: unknown = this.collection.findOne({ id }, READ);
    if (raw === undefined) return { found: false };
    return { found: true, value: this.entryOf(raw, 0)[1] };
  }

  /** The item of a value. The codec must give a plain object with the id. */
  private itemOf(id: string, value: T): SignalDbItem {
    const item: unknown = this.codec.toItem(id, value);
    if (!isPlainObject(item) || item["id"] !== id) {
      throw new TypeError(`The codec of the SignalDbStorage ${this.name} gave no item with the id ${JSON.stringify(id)}`);
    }
    return item as SignalDbItem;
  }

  /** A write of a value: a copy of the value, and its item. */
  private prepare(id: string, value: T): Prepared<T> {
    const copy = structuredClone(value);
    return { id, value: copy, item: this.itemOf(id, copy) };
  }

  /** This method writes an item. An existing id keeps its place in the order of the entries. */
  private put(write: Prepared<T>, changes: Array<StorageChangeEvent<T>>): void {
    this.collection.replaceOne({ id: write.id }, write.item, { upsert: true });
    changes.push({ type: "set", id: write.id, value: write.value });
  }

  /** This method deletes the item of an id. True when the item existed. */
  private remove(id: string, changes: Array<StorageChangeEvent<T>>): boolean {
    if (this.collection.removeOne({ id }) === 0) return false;
    changes.push({ type: "delete", id });
    return true;
  }

  /**
   * One write of the storage: `body` reads, tests and writes in one synchronous step. The events of
   * the collection during the step are not changes of the app. The observers get the changes of the
   * step after it, also when it fails after a change, with copies of the values.
   */
  private write<R>(origin: string | undefined, body: (changes: Array<StorageChangeEvent<T>>) => R): R {
    const changes: Array<StorageChangeEvent<T>> = [];
    this.writing = true;
    try {
      return body(changes);
    } finally {
      this.writing = false;
      if (changes.length > 0 && this.observers.size > 0) {
        this.observers.emit(changes.map((change) => withOrigin(change.type === "set" ? { ...change, value: structuredClone(change.value) } : change, origin)));
      }
    }
  }

  /**
   * One batch of the collection. `Collection.batch()` of SignalDB does not end its batch when the
   * callback throws, so the error leaves the batch first, and the batch ends.
   */
  private batch(body: () => void): void {
    let failure: { readonly error: unknown } | undefined;
    this.collection.batch(() => {
      try {
        body();
      } catch (error) {
        failure = { error };
      }
    });
    if (failure) throw failure.error;
  }

  /**
   * The preconditions of a write. A storage without `versionOf` throws a `TypeError` before the
   * write starts (roadmap CLI-16).
   */
  private preconditions(expected: ReadonlyArray<readonly [string, string | null]>): ReadonlyArray<readonly [string, string | null]> {
    if (expected.length === 0) return expected;
    if (!this.versionOf) throw preconditionNotSupported("This SignalDbStorage");
    for (const [id] of expected) checkId(id);
    return expected;
  }

  /** This method tests the expected versions in the step of the write. A conflict throws `VersionConflictError`. */
  private checkVersions(expected: ReadonlyArray<readonly [string, string | null]>): void {
    if (expected.length === 0 || !this.versionOf) return;
    const conflicts = versionConflicts(expected, (id) => this.current(id), this.versionOf);
    if (conflicts.length > 0) throw new VersionConflictError(conflicts);
  }

  //
  // ═══ The changes of the app ═══
  //

  private readonly onAdded = (item: unknown): void => this.appChange("set", item);
  private readonly onChanged = (item: unknown): void => this.appChange("set", item);
  private readonly onRemoved = (item: unknown): void => this.appChange("delete", item);

  /** This method starts to listen to the changes of the collection. */
  private listen(): void {
    if (this.listening) return;
    this.listening = true;
    this.collection.on("added", this.onAdded);
    this.collection.on("changed", this.onChanged);
    this.collection.on("removed", this.onRemoved);
  }

  /** This method stops to listen to the changes of the collection. */
  private unlisten(): void {
    if (!this.listening) return;
    this.listening = false;
    this.collection.off("added", this.onAdded);
    this.collection.off("changed", this.onChanged);
    this.collection.off("removed", this.onRemoved);
  }

  /**
   * This method gives a change that the app made on the collection to the observers. It never
   * throws: SignalDB calls it in the write of the app. An item that the storage cannot read goes to
   * `onObserverError`.
   */
  private appChange(type: "set" | "delete", item: unknown): void {
    if (this.writing || this.closed || this.observers.size === 0) return;
    let change: StorageChangeEvent<T>;
    try {
      const raw: unknown = structuredClone(item);
      if (!isPlainObject(raw) || typeof raw["id"] !== "string") throw this.problem("a changed item without a string id");
      change = type === "set" ? { type, id: raw["id"], value: this.codec.fromItem(raw as SignalDbItem) } : { type, id: raw["id"] };
    } catch (error) {
      this.onObserverError(error);
      return;
    }
    this.observers.emit([change]);
  }
}
