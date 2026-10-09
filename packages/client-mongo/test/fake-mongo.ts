/**
 * An in-memory fake of the parts of the MongoDB driver that the procedures use.
 *
 * The fake keeps the data in a `FakeServer`, so two connections see the same documents. A
 * closed connection fails each operation, as the driver does. Filters support equality,
 * `$or`, `$and` and `$in`. Updates support `$set`. An upsert takes `_id` from the filter
 * only when the filter has a direct `_id` value, as MongoDB does.
 */

import { ObjectId, type Document } from "mongodb";
import type { MongoConnection } from "../src/connection.js";

type Docs = Document[];

export class FakeServer {
  readonly databases = new Map<string, Map<string, Docs>>();

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

class FakeCursor {
  private skipped = 0;
  private limited = Infinity;

  constructor(private readonly docs: Docs) {}

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
    return new FakeCursor(this.docs.filter((d) => matches(d, filter)));
  }

  async countDocuments(filter: Document = {}): Promise<number> {
    this.record("countDocuments", filter);
    return this.docs.filter((d) => matches(d, filter)).length;
  }

  async insertOne(doc: Document): Promise<{ acknowledged: boolean; insertedId: unknown }> {
    this.record("insertOne", doc);
    const stored = { _id: new ObjectId(), ...doc };
    this.docs.push(stored);
    return { acknowledged: true, insertedId: stored["_id"] };
  }

  async insertMany(docs: Docs): Promise<{ acknowledged: boolean; insertedCount: number; insertedIds: Record<number, unknown> }> {
    this.record("insertMany", docs);
    const insertedIds: Record<number, unknown> = {};
    docs.forEach((doc, i) => {
      const stored = { _id: new ObjectId(), ...doc };
      this.docs.push(stored);
      insertedIds[i] = stored["_id"];
    });
    return { acknowledged: true, insertedCount: docs.length, insertedIds };
  }

  private update(filter: Document, update: Document, many: boolean, upsert: boolean) {
    const targets = this.docs.filter((d) => matches(d, filter));
    const chosen = many ? targets : targets.slice(0, 1);
    for (const doc of chosen) applyUpdate(doc, update);
    if (chosen.length === 0 && upsert) {
      const doc = upsertDocument(filter, update);
      this.docs.push(doc);
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
        docs.splice(i, 1);
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

  async bulkWrite(operations: Array<{ updateOne: { filter: Document; update: Document; upsert?: boolean } }>) {
    this.record("bulkWrite", operations);
    for (const op of operations) {
      this.update(op.updateOne.filter, op.updateOne.update, false, op.updateOne.upsert ?? false);
    }
    return { acknowledged: true };
  }
}

/** A fake connection to `server`. Each collection object belongs to this connection. */
export function fakeConnection(server: FakeServer, defaultDatabase = "test"): MongoConnection & {
  collections: Map<string, FakeCollection>;
} {
  let open = true;
  const collections = new Map<string, FakeCollection>();
  const isOpen = () => open;

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
