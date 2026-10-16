/**
 * An in-memory fake of the parts of the MongoDB driver that the procedures use.
 *
 * The fake keeps the data in a `FakeServer`, so two connections see the same documents. A
 * closed connection fails each operation, as the driver does. Filters support equality,
 * `$or`, `$and` and `$in`. Updates support `$set`. An upsert takes `_id` from the filter
 * only when the filter has a direct `_id` value, as MongoDB does.
 *
 * Roadmap R44: `distinct`, `bulkWrite` with the five operations, `explain` of a find and of an
 * aggregation (a collection scan), and change streams. Each write of the fake makes a change
 * event, so a `watch` of a collection or a database sees the later writes.
 */

import { ObjectId, type Document } from "mongodb";
import type { MongoConnection } from "../src/connection.js";

type Docs = Document[];

export class FakeServer {
  readonly databases = new Map<string, Map<string, Docs>>();
  /** The indexes of each collection ("db.collection"), as listIndexes gives them. */
  readonly indexes = new Map<string, Document[]>();
  /** False: the server is a standalone server, which refuses change streams. */
  replicaSet = true;
  /** Each change event, in order (the oplog of the fake): a resume token replays the later ones. */
  readonly changeLog: Array<{ event: Document; lookup: Document | undefined }> = [];
  /** The open change streams. */
  readonly listeners = new Set<(event: Document, lookup: Document | undefined) => void>();
  private nextToken = 1;

  /** This function records a change event and gives it to each open change stream. */
  emit(event: Omit<Document, "_id">, lookup?: Document): void {
    const token = (this.nextToken++).toString(16).padStart(8, "0");
    const full: Document = { _id: { _data: token }, ...event, wallTime: new Date() };
    this.changeLog.push({ event: full, lookup });
    for (const listener of [...this.listeners]) listener(full, lookup);
  }

  /** The indexes of a collection, with the default `_id_` index first. */
  indexesOf(database: string, collection: string): Document[] {
    const key = `${database}.${collection}`;
    let list = this.indexes.get(key);
    if (!list) {
      list = [{ v: 2, key: { _id: 1 }, name: "_id_" }];
      this.indexes.set(key, list);
    }
    return list;
  }

  docs(database: string, collection: string): Docs {
    let db = this.databases.get(database);
    if (!db) {
      db = new Map();
      this.databases.set(database, db);
    }
    let docs = db.get(collection);
    if (!docs) {
      docs = [];
      db.set(collection, docs);
    }
    return docs;
  }
}

function same(a: unknown, b: unknown): boolean {
  if (a instanceof ObjectId || b instanceof ObjectId) {
    return a instanceof ObjectId && b instanceof ObjectId && a.equals(b);
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

function isOperatorObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !(value instanceof ObjectId) &&
    Object.keys(value).some((key) => key.startsWith("$"))
  );
}

export function matches(doc: Document, filter: Document): boolean {
  for (const [key, value] of Object.entries(filter)) {
    if (key === "$or") {
      if (!(value as Document[]).some((f) => matches(doc, f))) return false;
    } else if (key === "$and") {
      if (!(value as Document[]).every((f) => matches(doc, f))) return false;
    } else if (isOperatorObject(value)) {
      if ("$in" in value) {
        if (!(value["$in"] as unknown[]).some((v) => same(doc[key], v))) return false;
      } else {
        throw new Error(`The fake does not support ${Object.keys(value).join(", ")}`);
      }
    } else if (!same(doc[key], value)) {
      return false;
    }
  }
  return true;
}

function applyUpdate(doc: Document, update: Document): void {
  for (const [op, fields] of Object.entries(update)) {
    if (op !== "$set") throw new Error(`The fake does not support ${op}`);
    Object.assign(doc, fields);
  }
}

/** The document that an upsert inserts: the equality fields of the filter, then `$set`. */
function upsertDocument(filter: Document, update: Document): Document {
  const doc: Document = {};
  for (const [key, value] of Object.entries(filter)) {
    if (!key.startsWith("$") && !isOperatorObject(value)) doc[key] = value;
  }
  applyUpdate(doc, update);
  if (doc["_id"] === undefined) doc["_id"] = new ObjectId();
  return doc;
}

/** The explain document of the fake: a collection scan, as a server without an index gives. */
function fakeExplain(namespace: string, verbosity: unknown, parsed: Document, returned: number, examined: number): Document {
  const plan: Document = {
    explainVersion: "1",
    queryPlanner: { namespace, parsedQuery: parsed, winningPlan: { stage: "COLLSCAN" }, rejectedPlans: [] },
    command: { find: namespace.split(".")[1] },
    ok: 1,
    $clusterTime: { clusterTime: 1, signature: { hash: "", keyId: 0 } },
    operationTime: 1,
  };
  if (verbosity === "executionStats" || verbosity === "allPlansExecution") {
    plan["executionStats"] = { nReturned: returned, totalDocsExamined: examined, executionSuccess: true };
  }
  return plan;
}

class FakeCursor {
  private skipped = 0;
  private limited = Infinity;

  constructor(
    private readonly docs: Docs,
    private readonly namespace = "test.fake",
    private readonly filter: Document = {},
    private readonly examined = docs.length,
  ) {}

  /** The plan of the find: a collection scan. */
  async explain(verbosity?: unknown): Promise<Document> {
    const returned = Math.min(this.limited, Math.max(0, this.docs.length - this.skipped));
    return fakeExplain(this.namespace, verbosity ?? "queryPlanner", this.filter, returned, this.examined);
  }

  project(): this {
    return this;
  }
  sort(): this {
    return this;
  }
  skip(n: number): this {
    this.skipped = n;
    return this;
  }
  limit(n: number): this {
    this.limited = n;
    return this;
  }
  async toArray(): Promise<Docs> {
    return this.docs.slice(this.skipped, this.skipped + this.limited);
  }
}

/** The error of the driver for a call on a closed change stream. */
function changeStreamClosed(): Error {
  const error = new Error("ChangeStream is closed");
  error.name = "MongoAPIError";
  return error;
}

/**
 * A change stream of the fake. It gives the change events of its scope (a collection or a
 * database) that pass its `$match` stages. As the driver does, `next()` waits for the next event,
 * a close rejects a waiting `next()`, and the end of a `for await` closes the stream.
 */
export class FakeChangeStream {
  private readonly queue: Document[] = [];
  private waiting: { resolve: (event: Document) => void; reject: (error: Error) => void } | undefined;
  private isClosed = false;
  private readonly listener: (event: Document, lookup: Document | undefined) => void;

  constructor(
    private readonly server: FakeServer,
    private readonly scope: { db: string; coll?: string },
    private readonly pipeline: Document[],
    private readonly options: { fullDocument?: string; resumeAfter?: { _data?: string } } = {},
  ) {
    this.listener = (event, lookup) => this.offer(event, lookup);
    const after = options.resumeAfter?._data;
    if (after !== undefined) {
      for (const { event, lookup } of server.changeLog) {
        if ((event["_id"] as { _data: string })._data > after) this.offer(event, lookup);
      }
    }
    server.listeners.add(this.listener);
  }

  get closed(): boolean {
    return this.isClosed;
  }

  private offer(event: Document, lookup: Document | undefined): void {
    const ns = event["ns"] as { db: string; coll?: string };
    if (ns.db !== this.scope.db || (this.scope.coll !== undefined && ns.coll !== this.scope.coll)) return;
    for (const stage of this.pipeline) {
      if (stage["$match"] && !matches(event, stage["$match"] as Document)) return;
    }
    const item = this.options.fullDocument === "updateLookup" && lookup ? { ...event, fullDocument: lookup } : event;
    if (this.waiting) {
      const { resolve } = this.waiting;
      this.waiting = undefined;
      resolve(item);
    } else {
      this.queue.push(item);
    }
  }

  async next(): Promise<Document> {
    if (this.isClosed) throw changeStreamClosed();
    if (!this.server.replicaSet) {
      await this.close();
      const error = new Error("The $changeStream stage is only supported on replica sets");
      error.name = "MongoServerError";
      throw error;
    }
    const queued = this.queue.shift();
    if (queued) return queued;
    return new Promise((resolve, reject) => {
      this.waiting = { resolve, reject };
    });
  }

  async close(): Promise<void> {
    if (this.isClosed) return;
    this.isClosed = true;
    this.server.listeners.delete(this.listener);
    const waiting = this.waiting;
    this.waiting = undefined;
    waiting?.reject(changeStreamClosed());
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<Document, void, undefined> {
    if (this.isClosed) return;
    try {
      while (true) yield await this.next();
    } finally {
      await this.close();
    }
  }
}

/** The result of a bulk write of the fake, with the fields of the driver. */
interface FakeBulkResult {
  ok: number;
  insertedCount: number;
  matchedCount: number;
  modifiedCount: number;
  deletedCount: number;
  upsertedCount: number;
  insertedIds: Record<number, unknown>;
  upsertedIds: Record<number, unknown>;
}

export class FakeCollection {
  /** Each call that reached the collection: the method and its first argument. */
  readonly calls: Array<{ method: string; filter: unknown }> = [];

  constructor(
    private readonly server: FakeServer,
    private readonly database: string,
    readonly collectionName: string,
    private readonly isOpen: () => boolean,
  ) {}

  private get docs(): Docs {
    if (!this.isOpen()) throw new Error("MongoNotConnectedError: Client must be connected");
    return this.server.docs(this.database, this.collectionName);
  }

  private record(method: string, filter: unknown): void {
    this.calls.push({ method, filter });
  }

  async findOne(filter: Document): Promise<Document | null> {
    this.record("findOne", filter);
    return this.docs.find((d) => matches(d, filter)) ?? null;
  }

  find(filter: Document = {}): FakeCursor {
    this.record("find", filter);
    const docs = this.docs;
    return new FakeCursor(docs.filter((d) => matches(d, filter)), `${this.database}.${this.collectionName}`, filter, docs.length);
  }

  async countDocuments(filter: Document = {}): Promise<number> {
    this.record("countDocuments", filter);
    return this.docs.filter((d) => matches(d, filter)).length;
  }

  /** The distinct values of a field (no dots) in the matching documents. An array gives its elements. */
  async distinct(field: string, filter: Document = {}): Promise<unknown[]> {
    this.record("distinct", filter);
    const values: unknown[] = [];
    for (const doc of this.docs.filter((d) => matches(d, filter))) {
      const value = doc[field];
      for (const item of Array.isArray(value) ? value : [value]) {
        if (item !== undefined && !values.some((known) => same(known, item))) values.push(item);
      }
    }
    return values;
  }

  /** The change event of a write: the oplog of the fake. */
  private changed(operationType: string, doc: Document, extra: Document = {}): void {
    this.server.emit(
      { operationType, ns: { db: this.database, coll: this.collectionName }, documentKey: { _id: doc["_id"] }, ...extra },
      operationType === "update" ? { ...doc } : undefined,
    );
  }

  private insert(doc: Document): Document {
    const stored = { _id: new ObjectId(), ...doc };
    this.docs.push(stored);
    this.changed("insert", stored, { fullDocument: { ...stored } });
    return stored;
  }

  async insertOne(doc: Document): Promise<{ acknowledged: boolean; insertedId: unknown }> {
    this.record("insertOne", doc);
    const stored = this.insert(doc);
    return { acknowledged: true, insertedId: stored["_id"] };
  }

  async insertMany(docs: Docs): Promise<{ acknowledged: boolean; insertedCount: number; insertedIds: Record<number, unknown> }> {
    this.record("insertMany", docs);
    const insertedIds: Record<number, unknown> = {};
    docs.forEach((doc, i) => {
      insertedIds[i] = this.insert(doc)["_id"];
    });
    return { acknowledged: true, insertedCount: docs.length, insertedIds };
  }

  private update(filter: Document, update: Document, many: boolean, upsert: boolean) {
    const targets = this.docs.filter((d) => matches(d, filter));
    const chosen = many ? targets : targets.slice(0, 1);
    for (const doc of chosen) {
      applyUpdate(doc, update);
      this.changed("update", doc, { updateDescription: { updatedFields: { ...(update["$set"] as Document) }, removedFields: [] } });
    }
    if (chosen.length === 0 && upsert) {
      const doc = upsertDocument(filter, update);
      this.docs.push(doc);
      this.changed("insert", doc, { fullDocument: { ...doc } });
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedId: doc["_id"], upsertedCount: 1 };
    }
    return { acknowledged: true, matchedCount: chosen.length, modifiedCount: chosen.length, upsertedId: null, upsertedCount: 0 };
  }

  async updateOne(filter: Document, update: Document, options: { upsert?: boolean } = {}) {
    this.record("updateOne", filter);
    return this.update(filter, update, false, options.upsert ?? false);
  }

  async updateMany(filter: Document, update: Document, options: { upsert?: boolean } = {}) {
    this.record("updateMany", filter);
    return this.update(filter, update, true, options.upsert ?? false);
  }

  private remove(filter: Document, many: boolean) {
    const docs = this.docs;
    let deletedCount = 0;
    for (let i = 0; i < docs.length; ) {
      if (matches(docs[i]!, filter) && (many || deletedCount === 0)) {
        const [removed] = docs.splice(i, 1);
        this.changed("delete", removed!);
        deletedCount++;
      } else {
        i++;
      }
    }
    return { acknowledged: true, deletedCount };
  }

  async deleteOne(filter: Document) {
    this.record("deleteOne", filter);
    return this.remove(filter, false);
  }

  async deleteMany(filter: Document) {
    this.record("deleteMany", filter);
    return this.remove(filter, true);
  }

  /**
   * The bulk write of the driver: insertOne, updateOne, updateMany, deleteOne and deleteMany. In
   * order (the default), the first failure stops the rest. Unordered, each operation runs. A
   * failure throws a `MongoBulkWriteError` with the result and the index of each failure.
   */
  async bulkWrite(operations: Document[], options: { ordered?: boolean } = {}): Promise<FakeBulkResult> {
    this.record("bulkWrite", operations);
    const ordered = options.ordered ?? true;
    const result: FakeBulkResult = { ok: 1, insertedCount: 0, matchedCount: 0, modifiedCount: 0, deletedCount: 0, upsertedCount: 0, insertedIds: {}, upsertedIds: {} };
    const errors: Array<{ index: number; errmsg: string }> = [];
    for (const [index, operation] of operations.entries()) {
      try {
        const [kind, body] = Object.entries(operation)[0] as [string, Document];
        if (kind === "insertOne") {
          result.insertedIds[index] = this.insert(body["document"] as Document)["_id"];
          result.insertedCount++;
        } else if (kind === "updateOne" || kind === "updateMany") {
          const update = body["update"] as Document;
          if (!Object.keys(update).every((key) => key.startsWith("$"))) throw new Error("Update document requires atomic operators");
          const done = this.update(body["filter"] as Document, update, kind === "updateMany", body["upsert"] === true);
          result.matchedCount += done.matchedCount;
          result.modifiedCount += done.modifiedCount;
          if (done.upsertedId !== null) {
            result.upsertedIds[index] = done.upsertedId;
            result.upsertedCount++;
          }
        } else if (kind === "deleteOne" || kind === "deleteMany") {
          result.deletedCount += this.remove(body["filter"] as Document, kind === "deleteMany").deletedCount;
        } else {
          throw new Error(`The fake does not support the bulk operation ${kind}`);
        }
      } catch (error) {
        errors.push({ index, errmsg: (error as Error).message });
        if (ordered) break;
      }
    }
    if (errors.length > 0) {
      const error = Object.assign(new Error(errors[0]!.errmsg), { name: "MongoBulkWriteError", writeErrors: errors, result });
      throw error;
    }
    return result;
  }

  /** An aggregation that only gives the documents back (the pipeline is not run). */
  aggregate(pipeline: Document[] = []): { toArray(): Promise<Docs>; explain(verbosity?: unknown): Promise<Document> } {
    this.record("aggregate", pipeline);
    const namespace = `${this.database}.${this.collectionName}`;
    return {
      toArray: async () => this.docs.map((d) => ({ ...d })),
      explain: async (verbosity?: unknown) => ({ ...fakeExplain(namespace, verbosity ?? "queryPlanner", {}, this.docs.length, this.docs.length), stages: pipeline }),
    };
  }

  /** A change stream of this collection. */
  watch(pipeline: Document[] = [], options: Document = {}): FakeChangeStream {
    this.record("watch", pipeline);
    return new FakeChangeStream(this.server, { db: this.database, coll: this.collectionName }, pipeline, options);
  }

  async createIndex(keys: Document, options: { name?: string; unique?: boolean } = {}): Promise<string> {
    this.record("createIndex", keys);
    const name = options.name ?? Object.entries(keys).map(([field, kind]) => `${field}_${kind}`).join("_");
    const index: Document = { v: 2, key: keys, name };
    if (options.unique !== undefined) index["unique"] = options.unique;
    this.server.indexesOf(this.database, this.collectionName).push(index);
    return name;
  }

  listIndexes(): { toArray(): Promise<Docs> } {
    this.record("listIndexes", undefined);
    return { toArray: async () => this.server.indexesOf(this.database, this.collectionName).map((i) => ({ ...i })) };
  }

  async dropIndex(name: string): Promise<Document> {
    this.record("dropIndex", name);
    const list = this.server.indexesOf(this.database, this.collectionName);
    const at = list.findIndex((i) => i["name"] === name);
    if (at === -1) throw new Error(`index not found with name [${name}]`);
    list.splice(at, 1);
    return { nIndexesWas: list.length + 1, ok: 1 };
  }
}

/** A fake connection to `server`. Each collection object belongs to this connection. */
export function fakeConnection(server: FakeServer, defaultDatabase = "test"): MongoConnection & {
  collections: Map<string, FakeCollection>;
} {
  let open = true;
  const collections = new Map<string, FakeCollection>();
  const isOpen = () => open;

  const collectionNames = (database: string) => [...(server.databases.get(database)?.keys() ?? [])];
  const makeDb = (database: string) => ({
    databaseName: database,
    collection(name: string) {
      const key = `${database}.${name}`;
      let collection = collections.get(key);
      if (!collection) {
        collection = new FakeCollection(server, database, name, isOpen);
        collections.set(key, collection);
      }
      return collection;
    },
    async createCollection(name: string) {
      server.docs(database, name);
      return this.collection(name);
    },
    async dropCollection(name: string): Promise<boolean> {
      server.indexes.delete(`${database}.${name}`);
      return server.databases.get(database)?.delete(name) ?? false;
    },
    listCollections() {
      return { toArray: async () => collectionNames(database).map((name) => ({ name, type: "collection" })) };
    },
    /** A change stream of each collection of this database. */
    watch(pipeline: Document[] = [], options: Document = {}): FakeChangeStream {
      return new FakeChangeStream(server, { db: database }, pipeline, options);
    },
    async stats(): Promise<Document> {
      const size = collectionNames(database).reduce((sum, name) => sum + JSON.stringify(server.docs(database, name)).length, 0);
      return { db: database, collections: collectionNames(database).length, dataSize: size, ok: 1 };
    },
    async command(command: Document): Promise<Document> {
      if (command["ping"]) return { ok: 1 };
      if (typeof command["collStats"] === "string") {
        const name = command["collStats"];
        const docs = server.docs(database, name);
        const size = JSON.stringify(docs).length;
        return {
          ns: `${database}.${name}`,
          count: docs.length,
          size,
          avgObjSize: docs.length ? Math.round(size / docs.length) : 0,
          storageSize: 4096,
          nindexes: server.indexesOf(database, name).length,
          totalIndexSize: 4096,
          ok: 1,
        };
      }
      throw new Error(`The fake does not know the command ${JSON.stringify(command)}`);
    },
  });

  const client = { db: (name?: string) => makeDb(name ?? defaultDatabase) };
  const check = () => {
    if (!open) throw new Error("Connection has been closed");
  };

  return {
    collections,
    getDb: () => {
      check();
      return { ...makeDb(defaultDatabase), client } as never;
    },
    getClient: () => {
      check();
      return client as never;
    },
    connect: async () => {},
    disconnect: async () => {
      open = false;
    },
    isConnected: () => open,
  };
}
