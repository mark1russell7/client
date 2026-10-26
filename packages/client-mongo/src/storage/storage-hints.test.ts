/**
 * The change hints of a `MongoDocumentStorage` (roadmap CLI-77). `versionOfStored()`,
 * `storageChangeOf()` and the numbers of the own writes are pure, so their tests always run. The
 * watcher needs change streams, so a replica set: set `MONGO_TEST_URL` to one (CI has a replica-set
 * job). On a single server, the tests of the watcher skip.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, ObjectId, type Db, type Document } from "mongodb";
import { collectionChangeTopic, createEventBus, ms } from "@procedures/client";
import { DEFAULT_STORED_FORM, MongoDocumentStorage, versionOfStored, type MongoDocumentStorageOptions, type StoredForm } from "./document-storage.js";
import { storageChangeOf, watchStorageChanges, type StorageChangeHint } from "./storage-hints.js";
import { noteOwnNumbers, trackOwnNumbers } from "./own-writes.js";

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
  it("reads an insert, a replace and an update of the default form", () => {
    expect(storageChangeOf({ operationType: "insert", fullDocument: { _id: "t1\u001fa", _key: "a", _part: "t1", _seq: 5 }, documentKey: { _id: "t1\u001fa" } })).toEqual({
      id: "a",
      partition: "t1",
      deleted: false,
      version: "5",
      seq: 5,
    });
    expect(storageChangeOf({ operationType: "replace", fullDocument: { _id: "b", title: "raw" }, documentKey: { _id: "b" } })).toEqual({
      id: "b",
      partition: undefined,
      deleted: false,
      version: "0",
    });
    expect(storageChangeOf({ operationType: "update", fullDocument: { _id: "t2\u001fc", _key: "c", _part: "t2", _seq: 8 }, documentKey: { _id: "t2\u001fc" } })).toMatchObject({
      id: "c",
      partition: "t2",
      version: "8",
    });
  });

  it("reads a tombstone and a delete as deletes", () => {
    expect(storageChangeOf({ operationType: "replace", fullDocument: { _id: "t1\u001fa", _key: "a", _part: "t1", _seq: 9, _tomb: true }, documentKey: { _id: "t1\u001fa" } })).toEqual({
      id: "a",
      partition: "t1",
      deleted: true,
      seq: 9,
    });
    expect(storageChangeOf({ operationType: "delete", documentKey: { _id: "t1\u001fa" } })).toEqual({ id: "a", partition: "t1", deleted: true });
    // A delete with the image before the change reads its _key
    expect(storageChangeOf({ operationType: "delete", documentKey: { _id: new ObjectId() }, fullDocumentBeforeChange: { _key: "k", _seq: 2 } })).toMatchObject({ id: "k", deleted: true });
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
    expect(storageChangeOf({ operationType: "insert", fullDocument: { _id: "acme:r1", tenant: "acme" }, documentKey: { _id: "acme:r1" } }, tenantForm)).toEqual({
      id: "r1",
      partition: "acme",
      deleted: false,
      version: "0",
    });
    // A delete event has only the documentKey: the stored _id tells the partition
    expect(storageChangeOf({ operationType: "delete", documentKey: { _id: "acme:r1" } }, tenantForm)).toEqual({ id: "r1", partition: "acme", deleted: true });
  });
});

describe("the numbers of the own writes (CLI-77)", () => {
  const db = { databaseName: "own_numbers_test" } as unknown as Db;

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

  it("gives each tracker its own numbers", () => {
    const first = trackOwnNumbers(db, "shared");
    const second = trackOwnNumbers(db, "shared");
    noteOwnNumbers(db, "shared", 5, 1);
    expect(first.take(5)).toBe(true);
    expect(second.take(5)).toBe(true);
    first.close();
    second.close();
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

withMongo("watchStorageChanges on MongoDB (CLI-77)", { timeout: TEST_TIMEOUT_MS }, () => {
  it("publishes a raw write as a hint with the version of versionOf, on the topic of the partition", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const { collection, storage, bus, events, listen, log } = setup<{ title: string }>();
    const notes = storage.forPartition("t1");
    const topic = collectionChangeTopic(collection, "t1");
    listen(topic);
    const watch = watchStorageChanges(storage, bus, { log, backoff: { initialDelay: ms(20), jitter: 0 } });
    try {
      await watch.ready;
      // An old document, written directly in MongoDB: its version is 0
      await db.collection(collection).insertOne({ _id: "t1\u001fraw" as never, _part: "t1", title: "raw" });
      await eventually(() => expect(eventsOf(events, "raw")).toHaveLength(1));
      expect(await notes.versionOf("raw")).toBe("0");
      expect(eventsOf(events, "raw")[0]).toEqual({ topic, event: { changed: ["raw"], deleted: [], versions: [{ id: "raw", version: "0" }] } });

      // A write through the storage: the procedures publish it, so the watcher skips it (ownWrites "skip")
      await notes.set("a", { title: "a" });
      // A raw $set keeps _seq: the version stays the version of versionOf
      await db.collection(collection).updateOne({ _id: "t1\u001fa" as never }, { $set: { title: "raw a" } });
      await eventually(() => expect(eventsOf(events, "a")).toHaveLength(1));
      const version = await notes.versionOf("a");
      expect(Number(version)).toBeGreaterThan(0);
      expect(eventsOf(events, "a")[0]!.event).toEqual({ changed: ["a"], deleted: [], versions: [{ id: "a", version }] });

      // A raw delete is a delete; a delete through the storage (a tombstone) is skipped
      await notes.delete("a");
      await db.collection(collection).deleteOne({ _id: "t1\u001fraw" as never });
      await eventually(() => expect(eventsOf(events, "raw")).toHaveLength(2));
      expect(eventsOf(events, "raw")[1]!.event).toEqual({ changed: [], deleted: ["raw"] });
      expect(eventsOf(events, "a")).toHaveLength(1);
      expect(events.every((entry) => entry.topic === topic)).toBe(true);
    } finally {
      await watch.stop();
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
      expect(version).toBe("0");
      expect(published[0]).toEqual({ topic: "collections.app%2Enotes.acme", event: { changed: ["r1"], deleted: [], versions: [{ id: "r1", version }] } });
      // A hard delete has only the documentKey: the stored _id tells the partition
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
    } finally {
      await watch.stop();
    }
  });

  it("opens the stream again after an error, from the resume token: no change is lost", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
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
