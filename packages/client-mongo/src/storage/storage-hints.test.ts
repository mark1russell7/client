/**
 * The change hints of a `MongoDocumentStorage` (roadmap CLI-77). `versionOfStored()`,
 * `storageChangeOf()` and the numbers of the own writes are pure, so their tests always run. The
 * watcher needs change streams, so a replica set: set `MONGO_TEST_URL` to one (CI has a replica-set
 * job). On a single server, the tests of the watcher skip.
 */
import { EventEmitter } from "node:events";
import { afterAll, beforeAll, describe, expect, it, vi, type TestContext } from "vitest";
import { MongoClient, ObjectId, type Db, type Document } from "mongodb";
import { collectionChangeTopic, createEventBus, ms, type Clock } from "@procedures/client";
import { DEFAULT_STORED_FORM, MongoDocumentStorage, storageChangeSource, versionOfStored, type MongoDocumentStorageOptions, type StoredForm } from "./document-storage.js";
import { storageChangeOf, watchStorageChanges, type StorageChangeHint } from "./storage-hints.js";
import { noteOwnNumbers, notePrunedIds, trackOwnNumbers } from "./own-writes.js";

/**
 * A stored form of an app, a generic example: the stored `_id` is `<tenant>:<id>` (`main` without a
 * partition), and the field `tenant` names the partition. `partitionOf` reads the field, else the
 * part of the stored `_id` before ':' (a delete event has only the `_id`).
 */
const tenantForm: StoredForm = {
  storedId: (partition, id) => `${partition ?? "main"}:${id}`,
  idOf: (stored, partition) => {
    const prefix = `${partition ?? "main"}:`;
    return typeof stored === "string" && stored.startsWith(prefix) ? stored.slice(prefix.length) : undefined;
  },
  partitionFields: (partition) => ({ tenant: partition ?? "main" }),
  partitionOf: (doc) => (typeof doc["tenant"] === "string" ? doc["tenant"] : typeof doc["_id"] === "string" ? doc["_id"].split(":")[0] : undefined),
};

describe("versionOfStored (CLI-77)", () => {
  it("gives _seq as text, and 0 for a document without _seq", () => {
    expect(versionOfStored({ _id: "a", _key: "a", _seq: 7, title: "x" })).toBe("7");
    expect(versionOfStored({ _id: "t1\u001fa", _key: "a", _part: "t1", _seq: 12 })).toBe("12");
    expect(versionOfStored({ _id: "old", title: "an old document" })).toBe("0");
    expect(versionOfStored({ _id: "t1\u001fold", _part: "t1" })).toBe("0");
  });

  it("gives undefined for a tombstone, a value that is not a document, and a document without an id", () => {
    expect(versionOfStored({ _id: "a", _key: "a", _seq: 3, _tomb: true })).toBeUndefined();
    expect(versionOfStored(null as unknown as Document)).toBeUndefined();
    expect(versionOfStored([1, 2] as unknown as Document)).toBeUndefined();
    expect(versionOfStored({ _id: new ObjectId(), title: "no id" })).toBeUndefined();
  });

  it("reads the id with idOf of the form, else _key", () => {
    expect(versionOfStored({ _id: new ObjectId(), _key: "k", _seq: 4 })).toBe("4");
    expect(versionOfStored({ _id: "acme:r1", tenant: "acme" }, tenantForm)).toBe("0");
    expect(versionOfStored({ _id: "acme:r1", tenant: "acme", _seq: 9 }, tenantForm)).toBe("9");
    // A stored _id that idOf does not read, and no _key: no item
    expect(versionOfStored({ _id: 5, tenant: "acme" }, tenantForm)).toBeUndefined();
    // An explicit partition wins over partitionOf
    expect(versionOfStored({ _id: "beta:r1", tenant: "acme" }, tenantForm, "beta")).toBe("0");
    expect(versionOfStored({ _id: "beta:r1", tenant: "acme" }, tenantForm, "gamma")).toBeUndefined();
  });

  it("uses DEFAULT_STORED_FORM by default", () => {
    const doc = { _id: "t1\u001fa", _part: "t1", _seq: 2 };
    expect(versionOfStored(doc)).toBe(versionOfStored(doc, DEFAULT_STORED_FORM));
  });
});

describe("storageChangeOf (CLI-77)", () => {
  it("reads a write of the storage: an insert, a replace and an update with a new _seq", () => {
    expect(storageChangeOf({ operationType: "insert", fullDocument: { _id: "t1\u001fa", _key: "a", _part: "t1", _seq: 5 }, documentKey: { _id: "t1\u001fa" } })).toEqual({
      id: "a",
      partition: "t1",
      deleted: false,
      raw: false,
      version: "5",
      seq: 5,
    });
    // The version of an update is the _seq of the event, not the _seq of the lookup
    expect(
      storageChangeOf({
        operationType: "update",
        fullDocument: { _id: "t2\u001fc", _key: "c", _part: "t2", _seq: 9 },
        updateDescription: { updatedFields: { _seq: 8 }, removedFields: [] },
        documentKey: { _id: "t2\u001fc" },
      })
    ).toEqual({ id: "c", partition: "t2", deleted: false, raw: false, version: "8", seq: 8 });
  });

  it("reads a raw write from the event, never from the fullDocument of the lookup", () => {
    // A replace without _seq, and an insert without _seq
    expect(storageChangeOf({ operationType: "replace", fullDocument: { _id: "b", title: "raw" }, documentKey: { _id: "b" } })).toEqual({
      id: "b",
      partition: undefined,
      deleted: false,
      raw: true,
    });
    expect(storageChangeOf({ operationType: "insert", fullDocument: { _id: "b", title: "raw" }, documentKey: { _id: "b" } })).toMatchObject({ raw: true });
    // An update that does not set _seq: the lookup has a newer _seq, but the event tells a raw write. The image before tells the _seq it kept.
    expect(
      storageChangeOf({
        operationType: "update",
        fullDocument: { _id: "c", _key: "c", _seq: 12, title: "later" },
        fullDocumentBeforeChange: { _id: "c", _key: "c", _seq: 7, title: "before" },
        updateDescription: { updatedFields: { title: "raw" }, removedFields: [] },
        documentKey: { _id: "c" },
      })
    ).toEqual({ id: "c", partition: undefined, deleted: false, raw: true, seq: 7 });
    // Without the image, the lookup tells the _seq; an update that removes _seq keeps none
    expect(
      storageChangeOf({ operationType: "update", fullDocument: { _id: "c", _seq: 7 }, updateDescription: { updatedFields: { title: "raw" } }, documentKey: { _id: "c" } })
    ).toMatchObject({ raw: true, seq: 7 });
    expect(
      storageChangeOf({ operationType: "update", fullDocument: { _id: "c" }, updateDescription: { updatedFields: {}, removedFields: ["_seq"] }, documentKey: { _id: "c" } })
    ).toEqual({ id: "c", partition: undefined, deleted: false, raw: true });
  });

  it("reads a replace that copies the old _seq as raw only with the image before the change", () => {
    const replace = { operationType: "replace", fullDocument: { _id: "d", _key: "d", _seq: 4, title: "copy" }, documentKey: { _id: "d" } };
    expect(storageChangeOf({ ...replace, fullDocumentBeforeChange: { _id: "d", _key: "d", _seq: 4, title: "old" } })).toEqual({
      id: "d",
      partition: undefined,
      deleted: false,
      raw: true,
      seq: 4,
    });
    // Without the image, a replace with _seq counts as a write of the storage (the limit of the rule)
    expect(storageChangeOf(replace)).toMatchObject({ raw: false, version: "4" });
    // A write of the storage has another _seq than the image
    expect(storageChangeOf({ ...replace, fullDocumentBeforeChange: { _id: "d", _key: "d", _seq: 3 } })).toMatchObject({ raw: false, version: "4" });
  });

  it("reads the event of an adoption as a write of the storage: an adoption is never adopted again", () => {
    // The adoption sets _seq (and the fields that a raw replace took): _seq is in updatedFields
    const adoption = {
      operationType: "update",
      fullDocument: { _id: "t1\u001fr", _part: "t1", _ord: 0, _seq: 21, title: "raw" },
      fullDocumentBeforeChange: { _id: "t1\u001fr", title: "raw" },
      updateDescription: { updatedFields: { _part: "t1", _ord: 0, _seq: 21 }, removedFields: [] },
      documentKey: { _id: "t1\u001fr" },
    };
    expect(storageChangeOf(adoption)).toEqual({ id: "r", partition: "t1", deleted: false, raw: false, version: "21", seq: 21 });
  });

  it("reads a tombstone and a delete as deletes; a delete of an item is raw", () => {
    expect(storageChangeOf({ operationType: "replace", fullDocument: { _id: "t1\u001fa", _key: "a", _part: "t1", _seq: 9, _tomb: true }, documentKey: { _id: "t1\u001fa" } })).toEqual({
      id: "a",
      partition: "t1",
      deleted: true,
      raw: false,
      seq: 9,
    });
    expect(storageChangeOf({ operationType: "delete", documentKey: { _id: "t1\u001fa" } })).toEqual({ id: "a", partition: "t1", deleted: true, raw: true });
    // A delete with the image before the change reads its _key
    expect(storageChangeOf({ operationType: "delete", documentKey: { _id: new ObjectId() }, fullDocumentBeforeChange: { _key: "k", _seq: 2 } })).toMatchObject({
      id: "k",
      deleted: true,
      raw: true,
    });
  });

  it("gives undefined for an event of no item", () => {
    expect(storageChangeOf({ operationType: "drop" })).toBeUndefined();
    expect(storageChangeOf({ operationType: "invalidate" })).toBeUndefined();
    // An update whose document is gone: its delete event follows
    expect(storageChangeOf({ operationType: "update", fullDocument: null, documentKey: { _id: "a" } })).toBeUndefined();
    // The delete of a tombstone (a prune) deletes no item
    expect(storageChangeOf({ operationType: "delete", documentKey: { _id: "a" }, fullDocumentBeforeChange: { _id: "a", _key: "a", _tomb: true } })).toBeUndefined();
    // A document whose id neither idOf nor _key tells
    expect(storageChangeOf({ operationType: "insert", fullDocument: { _id: new ObjectId(), title: "x" }, documentKey: {} })).toBeUndefined();
  });

  it("reads the partition and the id with the stored form of the app", () => {
    expect(storageChangeOf({ operationType: "insert", fullDocument: { _id: "acme:r1", tenant: "acme", _seq: 3 }, documentKey: { _id: "acme:r1" } }, tenantForm)).toEqual({
      id: "r1",
      partition: "acme",
      deleted: false,
      raw: false,
      version: "3",
      seq: 3,
    });
    // A delete event has only the documentKey: the stored _id tells the partition
    expect(storageChangeOf({ operationType: "delete", documentKey: { _id: "acme:r1" } }, tenantForm)).toEqual({ id: "r1", partition: "acme", deleted: true, raw: true });
  });
});

describe("the writes of this process (CLI-77)", () => {
  const owner = {};
  const dbOf = (name: string): Db => ({ databaseName: name, client: owner }) as unknown as Db;
  const db = dbOf("own_numbers_test");

  it("takes each noted number once, and notes nothing without a tracker", () => {
    noteOwnNumbers(db, "notes", 1, 3);
    const own = trackOwnNumbers(db, "notes");
    expect(own.take(1)).toBe(false);
    noteOwnNumbers(db, "notes", 10, 2);
    noteOwnNumbers(db, "other", 12, 1);
    expect(own.take(10)).toBe(true);
    expect(own.take(10)).toBe(false);
    expect(own.take(11)).toBe(true);
    expect(own.take(12)).toBe(false);
    own.close();
    noteOwnNumbers(db, "notes", 20, 1);
    expect(own.take(20)).toBe(false);
  });

  it("gives each tracker its own numbers, and two Db objects of one client and one database share them", () => {
    const first = trackOwnNumbers(db, "shared");
    const second = trackOwnNumbers(dbOf("own_numbers_test"), "shared");
    const otherDatabase = trackOwnNumbers(dbOf("another_database"), "shared");
    noteOwnNumbers(dbOf("own_numbers_test"), "shared", 5, 1);
    expect(first.take(5)).toBe(true);
    expect(second.take(5)).toBe(true);
    expect(otherDatabase.take(5)).toBe(false);
    // Another client with the same database name has its own trackers
    const otherClient = { databaseName: "own_numbers_test", client: {} } as unknown as Db;
    noteOwnNumbers(otherClient, "shared", 6, 1);
    expect(first.take(6)).toBe(false);
    first.close();
    second.close();
    otherDatabase.close();
  });

  it("drops a noted number after its time limit on the clock of the tracker", () => {
    let now = 1_000;
    const own = trackOwnNumbers(db, "ttl", { clock: { now: () => now } });
    noteOwnNumbers(db, "ttl", 1, 2);
    expect(own.take(1)).toBe(true);
    now += 5 * 60_000 + 1;
    expect(own.take(2)).toBe(false);
    own.close();
  });

  it("notes the stored _id of each pruned tombstone once, also for a tracker without numbers", () => {
    const own = trackOwnNumbers(db, "pruned", { numbers: false });
    noteOwnNumbers(db, "pruned", 1, 1);
    expect(own.take(1)).toBe(false);
    const oid = new ObjectId();
    notePrunedIds(db, "pruned", ["a", oid]);
    expect(own.takePruned("a")).toBe(true);
    expect(own.takePruned("a")).toBe(false);
    // An ObjectId and its hex text are two ids
    expect(own.takePruned(oid.toHexString())).toBe(false);
    expect(own.takePruned(new ObjectId(oid.toHexString()))).toBe(true);
    own.close();
  });
});

/** A stream of a fake database: the test emits its events. */
class FakeStream extends EventEmitter {
  closed = false;
  async close(): Promise<void> {
    this.closed = true;
  }
}

/** A storage of a fake database, with its streams, its timers and its log: for the rules that need no server. */
function fakeWatch(collections: { counters?: Document; items?: Document } = {}) {
  const streams: FakeStream[] = [];
  const items = {
    watch: () => {
      const stream = new FakeStream();
      streams.push(stream);
      return stream;
    },
    createIndexes: async () => [],
    ...collections.items,
  };
  const db = { databaseName: "fake", collection: (name: string) => (name === "__storage_counters" ? (collections.counters ?? {}) : items) } as unknown as Db;
  const storage = new MongoDocumentStorage<Document>({ collection: "fake_notes", db: async () => db });
  const timers: number[] = [];
  const clock = {
    now: () => 0,
    after: (delay: number) => {
      timers.push(delay);
      return () => undefined;
    },
  } as unknown as Clock;
  const logs: string[] = [];
  const log = (level: string, message: string): void => void logs.push(`${level}: ${message}`);
  const published: Array<{ topic: string; event: StorageChangeHint }> = [];
  const publish = (topic: string, event: StorageChangeHint): void => void published.push({ topic, event });
  /** The stream of the watcher, after the open of the stream. */
  const stream = async (index = 0): Promise<FakeStream> => {
    await vi.waitFor(() => expect(streams[index]).toBeDefined());
    return streams[index]!;
  };
  return { db, storage, streams, stream, timers, clock, logs, log, published, publish };
}

/** The error of a server, with its code. */
const serverError = (code: number, message: string): Error => Object.assign(new Error(message), { code });

describe("watchStorageChanges without a server (CLI-77)", () => {
  it("rejects ready and stops when the first open fails with an error that does not go away", async () => {
    for (const code of [13, 18, 40573]) {
      const { storage, stream, timers, clock, logs, log, publish } = fakeWatch();
      const watch = watchStorageChanges(storage, publish, { clock, log });
      (await stream()).emit("error", serverError(code, `refused ${code}`));
      await expect(watch.ready).rejects.toMatchObject({ code });
      // No retry: no timer of a backoff
      expect(timers).toEqual([]);
      expect(logs.filter((line) => line.startsWith("error"))).toHaveLength(1);
      await watch.stop();
    }
  });

  it("opens the stream again after an error that can go away, and ready waits", async () => {
    const { storage, stream, timers, clock, log, publish } = fakeWatch();
    const watch = watchStorageChanges(storage, publish, { clock, log, backoff: { initialDelay: ms(10), jitter: 0 } });
    (await stream()).emit("error", serverError(6, "host unreachable"));
    await vi.waitFor(() => expect(timers).toEqual([10]));
    const state = await Promise.race([
      watch.ready.then(
        () => "ready",
        () => "rejected"
      ),
      new Promise((resolve) => setTimeout(() => resolve("waits"), 20)),
    ]);
    expect(state).toBe("waits");
    await watch.stop();
    await expect(watch.ready).resolves.toBeUndefined();
  });

  it("publishes a gap to the plain topic and to each partition of the counters, of forPartition, of the hints, of the bus and of gapPartitions", async () => {
    const floors = [{ _id: "floor\u001ffake_notes\u001ft9" }, { _id: "floor\u001ffake_notes\u001f" }];
    const { storage, stream, clock, log } = fakeWatch({ counters: { find: () => ({ limit: () => ({ toArray: async () => floors }) }) } });
    storage.forPartition("t6");
    const bus = createEventBus();
    const events: Array<{ topic: string; event: StorageChangeHint }> = [];
    const topics = ["t5", "t6", "t7", "t8", "t9"].map((partition) => collectionChangeTopic("fake_notes", partition));
    for (const topic of [collectionChangeTopic("fake_notes"), ...topics]) bus.on<StorageChangeHint>(topic, (event) => void events.push({ topic, event }));
    // A subscriber of another collection: its partition gets no gap
    bus.on(collectionChangeTopic("another", "t0"), () => undefined);
    // The partitions of the subscribers that the bus tells: here t7, and the others above
    const watch = watchStorageChanges(storage, bus, { clock, log, gapPartitions: () => ["t8", undefined] });
    const changes = await stream();
    // A write of the storage in the partition t5 (of another process): a hint
    changes.emit("change", { _id: { t: 1 }, operationType: "insert", fullDocument: { _id: "t5\u001fa", _key: "a", _part: "t5", _seq: 3 }, documentKey: { _id: "t5\u001fa" } });
    changes.emit("change", { _id: { t: 2 }, operationType: "drop" });
    const gapTopics = (): string[] => events.filter(({ event }) => event.changed.length === 0 && event.deleted.length === 0).map(({ topic }) => topic);
    await vi.waitFor(() => expect(gapTopics()).toHaveLength(6));
    expect(new Set(gapTopics())).toEqual(new Set([collectionChangeTopic("fake_notes"), ...topics]));
    await watch.stop();
  });

  it("publishes a gap to the partitions of the hints and of gapPartitions when the counters cannot be read, and logs it", async () => {
    const { storage, stream, clock, logs, log, published, publish } = fakeWatch({
      counters: { find: () => ({ limit: () => ({ toArray: async () => Promise.reject(new Error("no read")) }) }) },
    });
    const watch = watchStorageChanges(storage, publish, { clock, log, gapPartitions: () => ["t8"] });
    const changes = await stream();
    changes.emit("change", { _id: { t: 1 }, operationType: "insert", fullDocument: { _id: "t5\u001fa", _key: "a", _part: "t5", _seq: 3 }, documentKey: { _id: "t5\u001fa" } });
    changes.emit("change", { _id: { t: 2 }, operationType: "rename" });
    const gaps = (): string[] => published.filter(({ event }) => event.changed.length === 0).map(({ topic }) => topic);
    await vi.waitFor(() => expect(gaps()).toHaveLength(3));
    expect(gaps()).toEqual([undefined, "t5", "t8"].map((partition) => collectionChangeTopic("fake_notes", partition)));
    expect(logs.some((line) => line.startsWith("warn") && line.includes("cannot be read"))).toBe(true);
    await watch.stop();
  });

  it("logs a refused adoption once, and publishes the hints of the raw writes without a version", async () => {
    const refused = serverError(13, "not authorized on fake to execute command findAndModify");
    const { storage, stream, clock, logs, log, published, publish } = fakeWatch({ counters: { findOneAndUpdate: async () => Promise.reject(refused) } });
    const watch = watchStorageChanges(storage, publish, { clock, log });
    const changes = await stream();
    changes.emit("change", { _id: { t: 1 }, operationType: "insert", fullDocument: { _id: "r1", title: "raw" }, documentKey: { _id: "r1" } });
    changes.emit("change", { _id: { t: 2 }, operationType: "insert", fullDocument: { _id: "r2", title: "raw" }, documentKey: { _id: "r2" } });
    await vi.waitFor(() => expect(published).toHaveLength(2));
    expect(published.map(({ event }) => event)).toEqual([
      { changed: ["r1"], deleted: [] },
      { changed: ["r2"], deleted: [] },
    ]);
    const errors = logs.filter((line) => line.startsWith("error"));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('rawWrites: "ignore"');
    await watch.stop();
  });

  it("leaves a raw write whose partition no form tells, with a log and a hint without a version", async () => {
    const { storage, stream, clock, logs, log, published, publish } = fakeWatch();
    const watch = watchStorageChanges(storage, publish, { clock, log });
    // The partition field names the partition "", which is no partition: the storage cannot adopt the document
    (await stream()).emit("change", { _id: { t: 1 }, operationType: "insert", fullDocument: { _id: "x", _key: "x", _part: "" }, documentKey: { _id: "x" } });
    await vi.waitFor(() => expect(published).toHaveLength(1));
    expect(published[0]!.event).toEqual({ changed: ["x"], deleted: [] });
    expect(logs.some((line) => line.includes('{"_id":"x"}') && line.includes("leaves it"))).toBe(true);
    await watch.stop();
  });

  it("refuses an unknown rawWrites or ownWrites", () => {
    const { storage, publish } = fakeWatch();
    expect(() => watchStorageChanges(storage, publish, { rawWrites: "keep" as never })).toThrow(TypeError);
    expect(() => watchStorageChanges(storage, publish, { ownWrites: "keep" as never })).toThrow(TypeError);
  });
});

const url = process.env["MONGO_TEST_URL"];
const withMongo = url ? describe : describe.skip;
let client: MongoClient | undefined;
let db: Db;
let replicaSet = false;
let next = 0;

beforeAll(async () => {
  if (!url) return;
  client = new MongoClient(url);
  await client.connect();
  const hello = await client.db("admin").command({ hello: 1 });
  replicaSet = typeof hello["setName"] === "string";
  if (!replicaSet && process.env["MONGO_TEST_TOPOLOGY"] === "replica-set") throw new Error("MONGO_TEST_TOPOLOGY is replica-set, but the test database is a single server");
  db = client.db(`client_mongo_hints_${process.pid}_${Date.now()}`);
});

afterAll(async () => {
  if (!client) return;
  await db.dropDatabase().catch(() => undefined);
  await client.close();
});

/** The longest wait of `eventually`. */
const EVENTUALLY_MS = 10_000;
/** The time limit of each test: more than the wait of `eventually`, with room for the setup. */
const TEST_TIMEOUT_MS = 30_000;

async function eventually(check: () => void | Promise<void>): Promise<void> {
  const until = Date.now() + EVENTUALLY_MS;
  for (;;) {
    try {
      await check();
      return;
    } catch (error) {
      if (Date.now() > until) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

/** The longest wait for the lock of the failpoint. */
const LOCK_WAIT_MS = 45_000;

/**
 * The failpoint `failCommand` and the server parameters are global to the server, and the test files
 * run at the same time. This lock (a document in a shared database) lets one test of a failpoint run
 * at a time. It ends with the test.
 */
async function lockFailpoints(context: TestContext): Promise<void> {
  const locks = client!.db("client_mongo_test_locks").collection<{ _id: string }>("locks");
  const until = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      await locks.insertOne({ _id: "failCommand" });
      break;
    } catch (error) {
      if ((error as { code?: unknown }).code !== 11000 || Date.now() > until) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  context.onTestFinished(async () => {
    await locks.deleteOne({ _id: "failCommand" });
  });
}

/** A new collection name, a storage of it, and the events that a subscriber of the bus gets. */
function setup<T = Document>(options: Partial<MongoDocumentStorageOptions<T>> = {}) {
  const collection = `h${++next}`;
  const storage = new MongoDocumentStorage<T>({ collection, db: () => db, client: () => client!, ...options });
  const bus = createEventBus();
  const events: Array<{ topic: string; event: StorageChangeHint }> = [];
  /** This function subscribes to a topic of the bus: the events go to `events`. */
  const listen = (topic: string): void => {
    bus.on<StorageChangeHint>(topic, (event) => void events.push({ topic, event }));
  };
  const logs: string[] = [];
  const log = (level: string, message: string): void => void logs.push(`${level}: ${message}`);
  return { collection, storage, bus, events, listen, logs, log };
}

/** The events of an id, in `changed` or in `deleted`. */
const eventsOf = (events: ReadonlyArray<{ topic: string; event: StorageChangeHint }>, id: string) =>
  events.filter(({ event }) => event.changed.includes(id) || event.deleted.includes(id));

/** The hints of a list after a sentinel: a raw insert of `sentinel` whose hint comes last, so each earlier event is in the list. */
async function settle(collection: string, published: ReadonlyArray<{ topic: string; event: StorageChangeHint }>, sentinel: string): Promise<void> {
  await db.collection(collection).insertOne({ _id: sentinel as never, title: "sentinel" });
  await eventually(() => expect(eventsOf(published, sentinel)).toHaveLength(1));
}

/** A new collection that keeps the image of each document before a change (`changeStreamPreAndPostImages`). */
async function withImages(collection: string): Promise<void> {
  await db.createCollection(collection, { changeStreamPreAndPostImages: { enabled: true } });
}

withMongo("watchStorageChanges on MongoDB (CLI-77)", { timeout: TEST_TIMEOUT_MS }, () => {
  it("rejects ready on a single server: change streams need a replica set", async (context) => {
    if (replicaSet) return context.skip?.("the test is for a single server");
    const { storage, log } = setup();
    const watch = watchStorageChanges(storage, () => undefined, { log });
    await expect(watch.ready).rejects.toMatchObject({ code: 40573 });
    await watch.stop();
  });

  it("adopts a raw write: the hint has the new version of versionOf, and changes(since) has the write", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const { collection, storage, bus, events, listen, log } = setup<{ title: string }>();
    const notes = storage.forPartition("t1");
    const topic = collectionChangeTopic(collection, "t1");
    listen(topic);
    const watch = watchStorageChanges(storage, bus, { log, backoff: { initialDelay: ms(20), jitter: 0 } });
    try {
      await watch.ready;
      const start = (await notes.getChangesSince()).version;
      // An old document, written directly in MongoDB: the storage gives it a _seq and the place of an old document
      await db.collection(collection).insertOne({ _id: "t1\u001fraw" as never, _part: "t1", title: "raw" });
      await eventually(() => expect(eventsOf(events, "raw")).toHaveLength(1));
      const adopted = await notes.versionOf("raw");
      expect(Number(adopted)).toBeGreaterThan(0);
      // The hint of the adoption: the adoption is not an own write, so ownWrites "skip" does not skip it
      expect(eventsOf(events, "raw")[0]).toEqual({ topic, event: { changed: ["raw"], deleted: [], versions: [{ id: "raw", version: adopted }] } });
      expect(await db.collection(collection).findOne({ _id: "t1\u001fraw" as never })).toEqual({ _id: "t1\u001fraw", _part: "t1", title: "raw", _ord: 0, _seq: Number(adopted) });
      // The item does not change: a document from outside the storage keeps its _id
      expect(await notes.get("raw")).toEqual({ _id: "raw", title: "raw" });
      const delta = await notes.getChangesSince(start);
      expect(delta.full).toBe(false);
      expect(delta.changed).toEqual([["raw", { _id: "raw", title: "raw" }]]);

      // A write through the storage: the procedures publish it, so the watcher skips it (ownWrites "skip")
      await notes.set("a", { title: "a" });
      const written = await notes.versionOf("a");
      // A raw $set keeps _seq: the storage adopts it with a new version, never the old one
      await db.collection(collection).updateOne({ _id: "t1\u001fa" as never }, { $set: { title: "raw a" } });
      await eventually(() => expect(eventsOf(events, "a")).toHaveLength(1));
      const version = await notes.versionOf("a");
      expect(Number(version)).toBeGreaterThan(Number(written));
      expect(eventsOf(events, "a")[0]!.event).toEqual({ changed: ["a"], deleted: [], versions: [{ id: "a", version }] });
      expect(await notes.get("a")).toEqual({ title: "raw a" });
      expect((await notes.getChangesSince(`${start.split(".")[0]}.${written}`)).changed).toEqual([["a", { title: "raw a" }]]);

      // A raw delete without the image before the change: a hint without a version, and no tombstone
      await notes.delete("a");
      await db.collection(collection).deleteOne({ _id: "t1\u001fraw" as never });
      await eventually(() => expect(eventsOf(events, "raw")).toHaveLength(2));
      expect(eventsOf(events, "raw")[1]!.event).toEqual({ changed: [], deleted: ["raw"] });
      expect(await db.collection(collection).countDocuments({ _id: "t1\u001fraw" as never })).toBe(0);
      // The delete through the storage (a tombstone) is skipped
      expect(eventsOf(events, "a")).toHaveLength(1);
      expect(events.every((entry) => entry.topic === topic)).toBe(true);
    } finally {
      await watch.stop();
    }
  });

  it("adopts each raw write once: the event of the adoption is never adopted again", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const { collection, storage, log } = setup<{ title: string }>();
    const published: Array<{ topic: string; event: StorageChangeHint }> = [];
    const watch = watchStorageChanges(storage, (topic, event) => void published.push({ topic, event }), { log });
    try {
      await watch.ready;
      await db.collection(collection).insertOne({ _id: "r" as never, title: "one" });
      await eventually(() => expect(eventsOf(published, "r")).toHaveLength(1));
      // A second raw write after the adoption: adopted once more
      await db.collection(collection).updateOne({ _id: "r" as never }, { $set: { title: "two" } });
      await eventually(() => expect(eventsOf(published, "r")).toHaveLength(2));
      await settle(collection, published, "sentinel");
      // Two raw writes, two adoptions: no loop
      expect(eventsOf(published, "r")).toHaveLength(2);
      const version = await storage.versionOf("r");
      expect(eventsOf(published, "r")[1]!.event.versions).toEqual([{ id: "r", version }]);
      expect(Number(eventsOf(published, "r")[0]!.event.versions![0]!.version)).toBeLessThan(Number(version));
    } finally {
      await watch.stop();
    }
  });

  it("lets one adoption win when two watchers race, and a write of the storage wins the same way", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const { collection, storage, log } = setup<{ title: string }>();
    // A second process: its own client, its own database object, its own storage
    const other = new MongoClient(url!);
    await other.connect();
    const otherDb = other.db(db.databaseName);
    const otherStorage = new MongoDocumentStorage<{ title: string }>({ collection, db: () => otherDb, client: () => other });
    const first: Array<{ topic: string; event: StorageChangeHint }> = [];
    const second: Array<{ topic: string; event: StorageChangeHint }> = [];
    const watches = [
      watchStorageChanges(storage, (topic, event) => void first.push({ topic, event }), { log }),
      watchStorageChanges(otherStorage, (topic, event) => void second.push({ topic, event }), { log }),
    ];
    try {
      await Promise.all(watches.map((watch) => watch.ready));
      await db.collection(collection).insertMany([
        { _id: "r1" as never, title: "raw" },
        { _id: "r2" as never, title: "raw" },
      ]);
      await settle(collection, first, "s1");
      await eventually(() => expect(eventsOf(second, "s1")).toHaveLength(1));
      // One adoption of each write: each watcher publishes the one event of the winner
      for (const id of ["r1", "r2"]) {
        const version = await storage.versionOf(id);
        expect(eventsOf(first, id).map(({ event }) => event.versions)).toEqual([[{ id, version }]]);
        expect(eventsOf(second, id).map(({ event }) => event.versions)).toEqual([[{ id, version }]]);
      }

      // A write of the storage that comes before the adoption: the adoption sees another _seq, and does nothing
      const source = storageChangeSource(storage);
      await db.collection(collection).insertOne({ _id: "late" as never, title: "raw" });
      await eventually(() => expect(eventsOf(first, "late")).toHaveLength(1));
      const before = await storage.versionOf("late");
      await expect(source.adopt({ storedId: "late", seq: undefined, after: { _id: "late", title: "raw" } })).resolves.toBe("lost");
      await expect(source.adopt({ storedId: "late", seq: Number(before) - 1, after: { _id: "late", title: "raw" } })).resolves.toBe("lost");
      expect(await storage.versionOf("late")).toBe(before);
      await settle(collection, first, "s2");
      expect(eventsOf(first, "late")).toHaveLength(1);
    } finally {
      await Promise.all(watches.map((watch) => watch.stop()));
      await other.close();
    }
  });

  it("publishes raw writes without a version and writes nothing with rawWrites: ignore", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const { collection, storage, log } = setup<{ title: string }>();
    const published: Array<{ topic: string; event: StorageChangeHint }> = [];
    const watch = watchStorageChanges(storage, (topic, event) => void published.push({ topic, event }), { rawWrites: "ignore", log });
    try {
      await watch.ready;
      await db.collection(collection).insertOne({ _id: "r" as never, title: "raw" });
      await eventually(() => expect(eventsOf(published, "r")).toHaveLength(1));
      expect(published[0]!.event).toEqual({ changed: ["r"], deleted: [] });
      await settle(collection, published, "sentinel");
      expect(await db.collection(collection).findOne({ _id: "r" as never })).toEqual({ _id: "r", title: "raw" });
      expect(await storage.versionOf("r")).toBe("0");
    } finally {
      await watch.stop();
    }
  });

  it("publishes and adopts nothing for a prune of tombstones, with and without the image before the change", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    for (const images of [false, true]) {
      const { collection, storage, log } = setup<{ title: string }>({ maxTombstones: 1 });
      if (images) await withImages(collection);
      const published: Array<{ topic: string; event: StorageChangeHint }> = [];
      const watch = watchStorageChanges(storage, (topic, event) => void published.push({ topic, event }), { log });
      try {
        await watch.ready;
        await storage.setBatch([
          ["a", { title: "a" }],
          ["b", { title: "b" }],
          ["c", { title: "c" }],
        ]);
        // Each delete writes a tombstone, and the prune deletes the oldest tombstones over 1
        for (const id of ["a", "b", "c"]) await storage.delete(id);
        expect(await db.collection(collection).countDocuments({ _tomb: true })).toBe(1);
        const counter = await db.collection("__storage_counters").findOne({ _id: collection as never });
        await settle(collection, published, "sentinel");
        // Only the hint of the sentinel: the writes of the storage are own writes, and a prune is no change of an item
        expect(published.map(({ event }) => [...event.changed, ...event.deleted])).toEqual([["sentinel"]]);
        // No tombstone came back: one number for the sentinel only
        expect(await db.collection(collection).countDocuments({ _tomb: true })).toBe(1);
        const after = await db.collection("__storage_counters").findOne({ _id: collection as never });
        expect(after?.["seq"]).toBe(Number(counter?.["seq"]) + 1);
      } finally {
        await watch.stop();
      }
    }
  });

  it("adopts a raw hard delete as a tombstone with the image before the change", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const { collection, storage, log } = setup<{ title: string }>();
    await withImages(collection);
    const notes = storage.forPartition("t1");
    const published: Array<{ topic: string; event: StorageChangeHint }> = [];
    const watch = watchStorageChanges(storage, (topic, event) => void published.push({ topic, event }), { log });
    try {
      await watch.ready;
      await notes.set("a", { title: "a" });
      const start = (await notes.getChangesSince()).version;
      await db.collection(collection).deleteOne({ _id: "t1\u001fa" as never });
      await eventually(() => expect(eventsOf(published, "a")).toHaveLength(1));
      // The hint of the tombstone: a delete on the topic of the partition of the image
      expect(published[0]).toEqual({ topic: collectionChangeTopic(collection, "t1"), event: { changed: [], deleted: ["a"] } });
      const tomb = await db.collection(collection).findOne({ _id: "t1\u001fa" as never });
      expect(tomb).toMatchObject({ _key: "a", _part: "t1", _tomb: true });
      expect((await notes.getChangesSince(start)).deleted).toEqual(["a"]);

      // A raw insert of the same _id after the delete: the tombstone insert fails, so the newer document stays
      const source = storageChangeSource(storage);
      await db.collection(collection).replaceOne({ _id: "t1\u001fa" as never }, { _part: "t1", _key: "a", title: "again" });
      await expect(source.adopt({ storedId: "t1\u001fa", seq: undefined, before: { _id: "t1\u001fa", _key: "a", _part: "t1", title: "a" } })).resolves.toBe("lost");
      await eventually(async () => expect(await notes.get("a")).toEqual({ title: "again" }));
    } finally {
      await watch.stop();
    }
  });

  it("gives back the storage fields and the partition fields that a raw replace took, and never changes a field of the item", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const { collection, storage, log } = setup<{ tenant?: string; title: string }>({ form: tenantForm });
    await withImages(collection);
    const acme = storage.forPartition("acme");
    const published: Array<{ topic: string; event: StorageChangeHint }> = [];
    const watch = watchStorageChanges(storage, (topic, event) => void published.push({ topic, event }), { log });
    try {
      await watch.ready;
      // The item has the partition field: the storage keeps it in _kpf
      await acme.set("a", { tenant: "acme", title: "a" });
      const stored = await db.collection(collection).findOne({ _id: "acme:a" as never });
      expect(stored).toMatchObject({ _key: "a", tenant: "acme", _kpf: ["tenant"] });
      expect(typeof stored!["_ord"]).toBe("number");
      // A raw replace that drops _key, _ord, _kpf and _seq
      await db.collection(collection).replaceOne({ _id: "acme:a" as never }, { tenant: "acme", title: "raw" });
      await eventually(() => expect(eventsOf(published, "a")).toHaveLength(1));
      expect(published[0]!.topic).toBe(collectionChangeTopic(collection, "acme"));
      expect(await db.collection(collection).findOne({ _id: "acme:a" as never })).toMatchObject({ _key: "a", _ord: stored!["_ord"], _kpf: ["tenant"], tenant: "acme", title: "raw" });
      expect(await acme.get("a")).toEqual({ tenant: "acme", title: "raw" });

      // A raw replace that drops the partition field too: the stored _id tells the partition, and the item gets no field
      await db.collection(collection).replaceOne({ _id: "acme:a" as never }, { title: "raw 2" });
      await eventually(() => expect(eventsOf(published, "a")).toHaveLength(2));
      const doc = await db.collection(collection).findOne({ _id: "acme:a" as never });
      expect(doc).toMatchObject({ _key: "a", tenant: "acme", title: "raw 2" });
      expect(doc?.["_kpf"]).toBeUndefined();
      expect(await acme.get("a")).toEqual({ title: "raw 2" });
      expect(eventsOf(published, "a")[1]!.event.versions).toEqual([{ id: "a", version: await acme.versionOf("a") }]);
    } finally {
      await watch.stop();
    }
  });

  it("gives a raw write a number that a reader of changes(since) never passes (the watermark)", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const { collection, log } = setup();
    // The writes take the watermark, not a transaction; the reader is another process
    const storage = new MongoDocumentStorage<Document>({ collection, db: () => db, client: () => client!, transactions: "never" });
    const otherClient = new MongoClient(url!);
    await otherClient.connect();
    const readerOf = new MongoDocumentStorage<Document>({ collection, db: () => otherClient.db(db.databaseName), transactions: "never" });
    const published: Array<{ topic: string; event: StorageChangeHint }> = [];
    const watch = watchStorageChanges(storage, (topic, event) => void published.push({ topic, event }), { log });
    try {
      await watch.ready;
      let cursor = (await readerOf.getChangesSince()).version;
      const seen = new Set<string>();
      const ids = Array.from({ length: 20 }, (_, index) => `r${index}`);
      let writing = true;
      const reads = (async () => {
        while (writing) {
          const changes = await readerOf.getChangesSince(cursor);
          for (const [id] of changes.changed) seen.add(id);
          cursor = changes.version;
        }
      })();
      for (const id of ids) await db.collection(collection).insertOne({ _id: id as never, title: id });
      await eventually(() => expect(ids.every((id) => eventsOf(published, id).length === 1)).toBe(true));
      writing = false;
      await reads;
      // The reader goes on from its cursor: a number that it passed before its write would never come back
      await eventually(async () => {
        const changes = await readerOf.getChangesSince(cursor);
        expect(changes.full).toBe(false);
        for (const [id] of changes.changed) seen.add(id);
        cursor = changes.version;
        expect(ids.filter((id) => !seen.has(id))).toEqual([]);
      });
    } finally {
      await watch.stop();
      await otherClient.close();
    }
  });

  it("publishes the writes of this process too with ownWrites: publish", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const { collection, storage, log } = setup<{ title: string }>();
    const published: Array<{ topic: string; event: StorageChangeHint }> = [];
    const watch = watchStorageChanges(storage, (topic, event) => void published.push({ topic, event }), { ownWrites: "publish", log });
    try {
      await watch.ready;
      await storage.set("a", { title: "a" });
      await eventually(() => expect(eventsOf(published, "a")).toHaveLength(1));
      expect(published[0]).toEqual({ topic: collectionChangeTopic(collection), event: { changed: ["a"], deleted: [], versions: [{ id: "a", version: await storage.versionOf("a") }] } });
      await storage.delete("a");
      await eventually(() => expect(eventsOf(published, "a")).toHaveLength(2));
      expect(published[1]!.event).toEqual({ changed: [], deleted: ["a"] });
    } finally {
      await watch.stop();
    }
  });

  it("reads the partition and the id with the stored form, and takes the name of the procedures", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const { collection, storage, log } = setup<{ title: string }>({ form: tenantForm });
    const acme = storage.forPartition("acme");
    const published: Array<{ topic: string; event: StorageChangeHint }> = [];
    const watch = watchStorageChanges(storage, (topic, event) => void published.push({ topic, event }), { collection: "app.notes", log });
    try {
      await watch.ready;
      await db.collection(collection).insertOne({ _id: "acme:r1" as never, tenant: "acme", title: "raw" });
      await eventually(() => expect(eventsOf(published, "r1")).toHaveLength(1));
      const version = await acme.versionOf("r1");
      expect(Number(version)).toBeGreaterThan(0);
      expect(published[0]).toEqual({ topic: "collections.app%2Enotes.acme", event: { changed: ["r1"], deleted: [], versions: [{ id: "r1", version }] } });
      // A hard delete has only the documentKey: the stored _id tells the partition, and the hint has no version
      await db.collection(collection).deleteOne({ _id: "acme:r1" as never });
      await eventually(() => expect(eventsOf(published, "r1")).toHaveLength(2));
      expect(published[1]).toEqual({ topic: "collections.app%2Enotes.acme", event: { changed: [], deleted: ["r1"] } });
    } finally {
      await watch.stop();
    }
  });

  it("watches only the partition of a storage of a partition", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const { collection, storage, log } = setup<{ title: string }>();
    const published: Array<{ topic: string; event: StorageChangeHint }> = [];
    const watch = watchStorageChanges(storage.forPartition("t2"), (topic, event) => void published.push({ topic, event }), { log });
    try {
      await watch.ready;
      await db.collection(collection).insertMany([
        { _id: "t1\u001fx" as never, _part: "t1", title: "other" },
        { _id: "t2\u001fy" as never, _part: "t2", title: "mine" },
      ]);
      await eventually(() => expect(eventsOf(published, "y")).toHaveLength(1));
      expect(published.map(({ topic }) => topic)).toEqual([collectionChangeTopic(collection, "t2")]);
      // The storage of t2 adopts only its own documents
      expect(await db.collection(collection).findOne({ _id: "t1\u001fx" as never })).toEqual({ _id: "t1\u001fx", _part: "t1", title: "other" });
    } finally {
      await watch.stop();
    }
  });

  it("opens the stream again after an error, from the resume token: no change is lost", { timeout: LOCK_WAIT_MS + TEST_TIMEOUT_MS }, async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    await lockFailpoints(context);
    const admin = client!.db("admin");
    const failpoints = await admin.command({ configureFailPoint: "failCommand", mode: "off" }).then(
      () => true,
      () => false
    );
    if (!failpoints) {
      if (process.env["MONGO_TEST_FAILPOINTS"] === "1") throw new Error("MONGO_TEST_FAILPOINTS is 1, but the server has no test commands (enableTestCommands)");
      return context.skip?.("the failpoints need a server with enableTestCommands");
    }
    // Its own client, so the failpoint fails only the getMore of the stream
    const own = new MongoClient(url!, { appName: "storage-hints-resume" });
    await own.connect();
    const ownDb = own.db(db.databaseName);
    const collection = `h${++next}`;
    const storage = new MongoDocumentStorage<{ title: string }>({ collection, db: () => ownDb });
    const published: Array<{ topic: string; event: StorageChangeHint }> = [];
    const logs: string[] = [];
    const watch = watchStorageChanges(storage, (topic, event) => void published.push({ topic, event }), {
      backoff: { initialDelay: ms(20), jitter: 0 },
      log: (level, message) => void logs.push(`${level}: ${message}`),
    });
    try {
      await watch.ready;
      await db.collection(collection).insertOne({ _id: "r1" as never, title: "before" });
      await eventually(() => expect(eventsOf(published, "r1")).toHaveLength(1));
      // The next getMore of the stream fails with an error that the driver does not resume (BadValue)
      await admin.command({ configureFailPoint: "failCommand", mode: { times: 1 }, data: { failCommands: ["getMore"], appName: "storage-hints-resume", errorCode: 2 } });
      await db.collection(collection).insertOne({ _id: "r2" as never, title: "during" });
      await eventually(() => expect(logs.some((line) => line.startsWith("warn") && line.includes("failed"))).toBe(true));
      await db.collection(collection).insertOne({ _id: "r3" as never, title: "after" });
      await eventually(() => expect(eventsOf(published, "r3")).toHaveLength(1));
      expect(eventsOf(published, "r2")).toHaveLength(1);
      // The new stream does not give the changes before its token again
      expect(eventsOf(published, "r1")).toHaveLength(1);
      // No gap: the new stream started from the token, so no hint without ids
      expect(published.every(({ event }) => event.changed.length + event.deleted.length > 0)).toBe(true);
    } finally {
      await admin.command({ configureFailPoint: "failCommand", mode: "off" });
      await watch.stop();
      await own.close();
    }
  });
});
