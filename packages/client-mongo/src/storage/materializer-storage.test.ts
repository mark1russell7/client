/**
 * The targets of a `ViewMaterializer` in the stored form of a `MongoDocumentStorage` (roadmap
 * CLI-81), and the hints of the other targets, on a real MongoDB. Change streams need a replica
 * set: set `MONGO_TEST_URL` to one (CI has a replica-set job). On a single server, the tests skip,
 * except in the replica-set job of CI. The tests of a failpoint need `enableTestCommands`.
 */

import { afterAll, beforeAll, describe, expect, it, type TestContext } from "vitest";
import { MongoClient, type Db, type Document, type ObjectId } from "mongodb";
import { collectionChangeTopic, ms, type CollectionChangeEvent } from "@procedures/client";
import { ViewMaterializer, viewFilter, type MaterializedView, type ViewMaterializerOptions } from "./materializer.js";
import { DEFAULT_STORED_FORM, MongoDocumentStorage, type StoredForm } from "./document-storage.js";
import { watchStorageChanges } from "./storage-hints.js";

const url = process.env["MONGO_TEST_URL"];
let client: MongoClient | undefined;
let replicaSet = false;
let next = 0;

beforeAll(async () => {
  if (!url) return;
  client = new MongoClient(url);
  await client.connect();
  const hello = await client.db("admin").command({ hello: 1 });
  replicaSet = typeof hello["setName"] === "string";
  if (!replicaSet && process.env["MONGO_TEST_TOPOLOGY"] === "replica-set") throw new Error("MONGO_TEST_TOPOLOGY is replica-set, but the test database is a single server");
});

const dbs: Db[] = [];

afterAll(async () => {
  for (const db of dbs) await db.dropDatabase().catch(() => undefined);
  await client?.close();
});

/** The longest wait for the lock of the failpoint. A lock that is older is stale: a waiter takes it. */
const LOCK_WAIT_MS = 45_000;

/**
 * The failpoint `failCommand` is global to the server, and the test files run at the same time.
 * This lock (a document in a shared database, the same as in the other test files) lets one test of
 * a failpoint run at a time. It ends with the test.
 */
async function lockFailpoints(context: TestContext): Promise<void> {
  const locks = client!.db("client_mongo_test_locks").collection<{ _id: string; at: Date }>("locks");
  const until = Date.now() + LOCK_WAIT_MS;
  let at = new Date();
  for (;;) {
    at = new Date();
    try {
      await locks.insertOne({ _id: "failCommand", at });
      break;
    } catch (error) {
      if ((error as { code?: unknown }).code !== 11000 || Date.now() > until) throw error;
      const stale = await locks.deleteOne({ _id: "failCommand", at: { $lt: new Date(Date.now() - LOCK_WAIT_MS) } });
      if (stale.deletedCount === 0) await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  context.onTestFinished(async () => {
    await locks.deleteOne({ _id: "failCommand", at });
  });
}

/** True when the server has the failpoints. Without them, the test skips, except in the job of CI with failpoints. */
async function hasFailpoints(): Promise<boolean> {
  const ok = await client!
    .db("admin")
    .command({ configureFailPoint: "failCommand", mode: "off" })
    .then(
      () => true,
      () => false
    );
  if (!ok && process.env["MONGO_TEST_FAILPOINTS"] === "1") throw new Error("MONGO_TEST_FAILPOINTS is 1, but the server has no test commands (enableTestCommands)");
  return ok;
}

/** A new database of the test, on the given client. */
function newDb(on: MongoClient = client!): Db {
  const db = on.db(`client_mongo_vstore_${process.pid}_${Date.now()}_${++next}`);
  dbs.push(client!.db(db.databaseName));
  return db;
}

/** A materializer on a database, with a log that the test reads. */
function materializer(db: Db, options: Partial<ViewMaterializerOptions> = {}) {
  const logs: string[] = [];
  const views = new ViewMaterializer({ db: () => db, debounce: ms(20), rewatch: ms(100), log: (level, message) => void logs.push(`${level}: ${message}`), ...options });
  return { views, logs };
}

/** The longest wait of `eventually`. */
const EVENTUALLY_MS = 10_000;

/** The time limit of each test: more than the wait of `eventually`, with room for the setup. */
const TEST_TIMEOUT_MS = 30_000;

async function eventually(check: () => Promise<void> | void): Promise<void> {
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

const sleep = (time: number) => new Promise((resolve) => setTimeout(resolve, time));

/** A form with its own `_id` and two partition fields: `<partition>:<id>`, `tenant` and `scope`. */
const TENANT_FORM: StoredForm = {
  storedId: (partition, id) => `${partition}:${id}`,
  idOf: (stored, partition) => (typeof stored === "string" && stored.startsWith(`${partition}:`) ? stored.slice(`${partition}:`.length) : undefined),
  partitionFields: (partition) => ({ tenant: partition, scope: "views" }),
  partitionOf: (doc) => (typeof doc["tenant"] === "string" ? doc["tenant"] : typeof doc["_id"] === "string" ? doc["_id"].split(":")[0] : undefined),
};

const sumsView = (overrides: Partial<MaterializedView> = {}): MaterializedView => ({
  _id: "sums",
  _part: "t1",
  collections: ["items"],
  pipeline: [{ $group: { _id: "$kind", total: { $sum: "$n" } } }],
  targetCollection: "sums",
  ...overrides,
});

/** The status of a view. */
const statusOf = async (db: Db, id: string): Promise<Document | undefined> => ((await db.collection("_aggregations").findOne({ _id: id as never })) as Document | null)?.["_materializerStatus"];

/** The sequence counter of a collection. */
const seqOf = async (db: Db, collection: string): Promise<number | undefined> => (await db.collection("__storage_counters").findOne({ _id: collection as never }))?.["seq"];

/** The number of a version of `changes`. */
const numberOf = (version: string): number => Number(version.split(".")[1]);

const withMongo = url ? describe : describe.skip;

withMongo("ViewMaterializer with a target in a stored form", { timeout: TEST_TIMEOUT_MS }, () => {
  it("writes the rows in the form of the target, and a watcher with ownWrites skip publishes each write with its version", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const db = newDb();
    const totals = new MongoDocumentStorage<Document>({ collection: "totals", db: () => db, form: TENANT_FORM });
    const { views, logs } = materializer(db, { partitionField: "tenant", storageTargets: { totals } });
    const events: Array<{ topic: string; event: CollectionChangeEvent }> = [];
    const watch = watchStorageChanges(totals, (topic, event) => void events.push({ topic, event }), { ownWrites: "skip", log: () => undefined });
    try {
      await watch.ready;
      await db.collection("items").insertMany([
        { _id: "1" as never, tenant: "t1", kind: "a", n: 1 },
        { _id: "2" as never, tenant: "t1", kind: "a", n: 2 },
        { _id: "3" as never, tenant: "t1", kind: "b", n: 5 },
        { _id: "4" as never, tenant: "t2", kind: "a", n: 100 },
      ]);
      // The partition field of this materializer is `tenant`: the view has no `_part`
      const view: Document = { ...sumsView({ _id: "byKind", tenant: "t1", targetCollection: "totals" }) };
      delete view["_part"];
      await db.collection("_aggregations").insertOne(view as never);
      await views.start();
      const t1 = totals.forPartition("t1");
      await eventually(async () =>
        expect(new Map(await t1.getEntries())).toEqual(
          new Map([
            ["a", { _id: "a", total: 3 }],
            ["b", { _id: "b", total: 5 }],
          ])
        )
      );
      // The document has the stored `_id`, the partition fields and the fields of the form, and no field of the materializer
      const raw = await db.collection("totals").findOne({ _id: "t1:a" as never });
      expect(raw).toEqual({ _id: "t1:a", _key: "a", _seq: raw!["_seq"], _ord: raw!["_ord"], tenant: "t1", scope: "views", _kid: true, total: 3 });
      expect(raw!["_ord"]).toBe(raw!["_seq"]);
      // The materializer does not note its numbers as own writes: the watcher publishes each write, with the version of the storage
      const topic = collectionChangeTopic("totals", "t1");
      for (const id of ["a", "b"]) {
        const version = await t1.versionOf(id);
        await eventually(() => expect(events.some(({ topic: at, event }) => at === topic && event.changed.includes(id) && event.versions?.some((entry) => entry.id === id && entry.version === version))).toBe(true));
      }
      // A change of a source: the removed row is a tombstone, and the delta and the watcher have the delete
      const start = (await t1.getChangesSince()).version;
      await db.collection("items").deleteOne({ _id: "3" as never });
      await eventually(async () => expect(await t1.has("b")).toBe(false));
      await eventually(() => expect(events.some(({ topic: at, event }) => at === topic && event.deleted.includes("b"))).toBe(true));
      expect(await t1.getChangesSince(start)).toMatchObject({ full: false, changed: [], deleted: ["b"] });
      expect(await db.collection("totals").findOne({ _id: "t1:b" as never })).toMatchObject({ _key: "b", _tomb: true, tenant: "t1", scope: "views" });
      // No raw write to adopt: each document has its number
      expect(await db.collection("totals").countDocuments({ _seq: { $exists: false } })).toBe(0);
      expect(logs.filter((line) => line.startsWith("error"))).toEqual([]);
    } finally {
      await watch.stop();
      await views.stop();
    }
  });

  it("sets _key, _kid, _kpf and _ord from the target form, also for a pass-through row and for the rows of $unwind", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const db = newDb();
    const copies = new MongoDocumentStorage<Document>({ collection: "copies", db: () => db });
    // A target with only its form: the materializer makes its storage
    const { views, logs } = materializer(db, { storageTargets: { copies, tagged: DEFAULT_STORED_FORM } });
    try {
      // A source document with the fields of a storage that do not fit the row
      await db.collection("raw").insertOne({ _id: "x" as never, _part: "t1", _key: "zzz", _kpf: ["label"], _ord: 999, _seq: 7, _kid: false, label: "x", tags: ["p", "q"] });
      await db.collection("_aggregations").insertMany([
        { _id: "copy", _part: "t1", collections: ["raw"], pipeline: [{ $match: {} }], targetCollection: "copies" },
        { _id: "unwind", _part: "t1", collections: ["raw"], pipeline: [{ $unwind: "$tags" }, { $set: { _id: { $concat: ["$label", "-", "$tags"] } } }], targetCollection: "tagged" },
      ] as never[]);
      await views.start();
      const copy = copies.forPartition("t1");
      await eventually(async () => expect(await copy.getEntries()).toEqual([["x", { _id: "x", label: "x", tags: ["p", "q"] }]]));
      const doc = await db.collection("copies").findOne({ _id: "t1\u001fx" as never });
      expect(doc).toEqual({ _id: "t1\u001fx", _key: "x", _seq: doc!["_seq"], _ord: doc!["_seq"], _part: "t1", _kid: true, label: "x", tags: ["p", "q"] });
      expect(doc!["_seq"]).toBeLessThan(999);

      // The rows of $unwind share the _key of the source: each one gets its own
      const tagged = new MongoDocumentStorage<Document>({ collection: "tagged", db: () => db }).forPartition("t1");
      await eventually(async () =>
        expect(new Map(await tagged.getEntries())).toEqual(
          new Map([
            ["x-p", { _id: "x-p", label: "x", tags: "p" }],
            ["x-q", { _id: "x-q", label: "x", tags: "q" }],
          ])
        )
      );
      for (const id of ["x-p", "x-q"]) {
        const row = await db.collection("tagged").findOne({ _id: `t1\u001f${id}` as never });
        expect(row).toMatchObject({ _key: id, _ord: row!["_seq"] });
        expect(row).not.toHaveProperty("_kpf");
      }
      expect(logs.filter((line) => line.startsWith("error"))).toEqual([]);
    } finally {
      await views.stop();
    }
  });

  it("encodes _json again from the content of the row: a view of an item stored as JSON adds a field, and the target read shows it", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const db = newDb();
    const notes = new MongoDocumentStorage<Document>({ collection: "notes", db: () => db });
    const outs = new MongoDocumentStorage<Document>({ collection: "outs", db: () => db });
    const { views, logs } = materializer(db, { storageTargets: { outs } });
    try {
      // A key with $: the storage keeps the item as JSON text (`_json`)
      await notes.forPartition("t1").set("a", { $weird: 1, kind: "k" });
      expect(typeof (await db.collection("notes").findOne({ _id: "t1\u001fa" as never }))?.["_json"]).toBe("string");
      await db.collection("_aggregations").insertOne({
        _id: "outs",
        _part: "t1",
        collections: ["notes"],
        // The row keeps the `_json` of the source, adds a field, and a key with $ (so the target item is JSON text too)
        pipeline: [{ $addFields: { extra: "added" } }, { $set: { _id: "$_key" } }, { $replaceWith: { $setField: { field: { $literal: "$odd" }, input: "$$ROOT", value: 2 } } }],
        targetCollection: "outs",
      } as never);
      await views.start();
      const out = outs.forPartition("t1");
      await eventually(async () => expect(await out.get("a")).toEqual({ _id: "a", extra: "added", $odd: 2 }));
      const doc = await db.collection("outs").findOne({ _id: "t1\u001fa" as never });
      expect(JSON.parse(doc!["_json"] as string)).toEqual({ _id: "a", extra: "added", $odd: 2 });
      expect(doc!["_json"]).not.toContain("weird");
      expect(logs.filter((line) => line.startsWith("error"))).toEqual([]);
    } finally {
      await views.stop();
    }
  });

  it("writes nothing for a run whose rows did not change, keeps a tombstone, and a chain of two views does not loop", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const db = newDb();
    const sums = new MongoDocumentStorage<Document>({ collection: "sums", db: () => db });
    const copies = new MongoDocumentStorage<Document>({ collection: "copies", db: () => db });
    const { views, logs } = materializer(db, { storageTargets: { sums, copies } });
    try {
      await db.collection("items").insertMany([
        { _id: "1" as never, _part: "t1", kind: "a", n: 1 },
        { _id: "2" as never, _part: "t1", kind: "b", n: 2 },
      ]);
      await db.collection("_aggregations").insertMany([
        sumsView(),
        // A view of the target of the first view: the storage fields of its rows do not go into the copies
        { _id: "copy", _part: "t1", collections: ["sums"], pipeline: [{ $project: { _id: "$_key", total: 1 } }], targetCollection: "copies" },
      ] as never[]);
      await views.start();
      const copy = copies.forPartition("t1");
      await eventually(async () => expect(new Map(await copy.getEntries())).toEqual(new Map([["a", { _id: "a", total: 1 }], ["b", { _id: "b", total: 2 }]])));
      // A source change that changes no row: the passes write nothing
      const settled = async (): Promise<{ sums: number | undefined; copies: number | undefined; at: number }> => ({ sums: await seqOf(db, "sums"), copies: await seqOf(db, "copies"), at: (await statusOf(db, "sums"))!["at"] as number });
      const before = await settled();
      await sleep(5);
      await db.collection("items").updateOne({ _id: "1" as never }, { $set: { note: "not read" } });
      await eventually(async () => expect(((await statusOf(db, "sums"))!["at"] as number) > before.at).toBe(true));
      await sleep(300);
      expect(await settled()).toMatchObject({ sums: before.sums, copies: before.copies });

      // A removed row: a tombstone in each target. A later pass does not write it again
      await db.collection("items").deleteOne({ _id: "2" as never });
      await eventually(async () => expect(await copy.has("b")).toBe(false));
      await sleep(300);
      const tombs = async () => [await db.collection("sums").findOne({ _id: "t1\u001fb" as never }), await db.collection("copies").findOne({ _id: "t1\u001fb" as never })];
      const [sumsTomb, copyTomb] = await tombs();
      expect(sumsTomb).toMatchObject({ _tomb: true, _key: "b" });
      expect(copyTomb).toMatchObject({ _tomb: true, _key: "b" });
      const afterDelete = await settled();
      await sleep(5);
      await db.collection("items").updateOne({ _id: "1" as never }, { $set: { note: "again" } });
      await eventually(async () => expect(((await statusOf(db, "sums"))!["at"] as number) > afterDelete.at).toBe(true));
      await sleep(300);
      expect(await settled()).toMatchObject({ sums: afterDelete.sums, copies: afterDelete.copies });
      expect(await tombs()).toEqual([sumsTomb, copyTomb]);
      expect(logs.filter((line) => line.startsWith("error"))).toEqual([]);
    } finally {
      await views.stop();
    }
  });

  it("prunes the tombstones through the storage: the floor goes up, and a reader far behind gets a full result", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const db = newDb();
    const sums = new MongoDocumentStorage<Document>({ collection: "sums", db: () => db, maxTombstones: 1 });
    const { views } = materializer(db, { storageTargets: { sums } });
    try {
      await db.collection("items").insertMany(["a", "b", "c"].map((kind, index) => ({ _id: String(index) as never, _part: "t1", kind, n: 1 })));
      await db.collection("_aggregations").insertOne(sumsView() as never);
      await views.start();
      const t1 = sums.forPartition("t1");
      await eventually(async () => expect(await t1.getIds()).toHaveLength(3));
      const behind = (await t1.getChangesSince()).version;
      await db.collection("items").deleteOne({ _id: "0" as never });
      await eventually(async () => expect(await t1.has("a")).toBe(false));
      await db.collection("items").deleteOne({ _id: "1" as never });
      await eventually(async () => expect(await t1.has("b")).toBe(false));
      // Two tombstones, and the limit is one: the prune drops the oldest and raises the floor
      await eventually(async () => expect(await db.collection("sums").countDocuments({ _tomb: true })).toBe(1));
      const floor = (await db.collection("__storage_counters").findOne({ _id: "floor\u001fsums\u001ft1" as never }))?.["floor"] as number;
      expect(floor).toBeGreaterThan(numberOf(behind));
      expect(await t1.getChangesSince(behind)).toMatchObject({ full: true, changed: [["c", { _id: "c", total: 1 }]] });
    } finally {
      await views.stop();
    }
  });

  it("tries a run again after a write conflict (code 112), so a conflict does not make the view give way", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    await lockFailpoints(context);
    if (!(await hasFailpoints())) return context.skip?.("the failpoints need a server with enableTestCommands");
    const admin = client!.db("admin");
    // Its own client, so the failpoint fails only the commands of the materializer
    const own = new MongoClient(url!, { appName: "views-storage-conflict" });
    await own.connect();
    const db = newDb(own);
    // The writes of the test go through the main client: the failpoint does not fail them
    const main = client!.db(db.databaseName);
    const sums = new MongoDocumentStorage<Document>({ collection: "sums", db: () => main });
    const { views, logs } = materializer(db, { storageTargets: { sums } });
    try {
      await main.collection("items").insertOne({ _id: "1" as never, _part: "t1", kind: "a", n: 1 });
      await main.collection("_aggregations").insertOne(sumsView() as never);
      await views.start();
      const t1 = sums.forPartition("t1");
      await eventually(async () => expect(await t1.get("a")).toEqual({ _id: "a", total: 1 }));
      // The next two writes of the run fail with a write conflict: the third try writes
      await admin.command({
        configureFailPoint: "failCommand",
        mode: { times: 2 },
        data: { failCommands: ["update"], appName: "views-storage-conflict", errorCode: 112, errorLabels: ["TransientTransactionError"] },
      });
      await main.collection("items").updateOne({ _id: "1" as never }, { $set: { n: 5 } });
      await eventually(async () => expect(await t1.get("a")).toEqual({ _id: "a", total: 5 }));
      expect(logs.filter((line) => line.includes("runs again later") || line.startsWith("error"))).toEqual([]);
    } finally {
      await admin.command({ configureFailPoint: "failCommand", mode: "off" });
      await views.stop();
      await own.close();
    }
  }, LOCK_WAIT_MS + 30_000);

  it("moves a late run to new numbers: a reader that passed the watermark during the run misses no row, and the places stay", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    await lockFailpoints(context);
    if (!(await hasFailpoints())) return context.skip?.("the failpoints need a server with enableTestCommands");
    const admin = client!.db("admin");
    const own = new MongoClient(url!, { appName: "views-storage-late" });
    await own.connect();
    const db = newDb(own);
    // The test and the reader write and read through the main client: the failpoint does not block them
    const main = client!.db(db.databaseName);
    // A short lease of the pending numbers: the blocked write of the run goes over it
    const sums = new MongoDocumentStorage<Document>({ collection: "sums", db: () => main, writeLease: ms(300) });
    const { views, logs } = materializer(db, { storageTargets: { sums } });
    const reader = sums.forPartition("t1");
    try {
      await main.collection("items").insertOne({ _id: "1" as never, _part: "t1", kind: "a", n: 1 });
      await main.collection("_aggregations").insertOne(sumsView() as never);
      await views.start();
      await eventually(async () => expect(await reader.get("a")).toEqual({ _id: "a", total: 1 }));
      const placeOfA = (await db.collection("sums").findOne({ _id: "t1a" as never }))!["_ord"] as number;
      const before = (await reader.getChangesSince()).version;
      // The write of the next run waits in its transaction, with its numbers pending. The block is long
      // (5 s) against the lease (300 ms), so a slow runner does not change the order of the steps
      await admin.command({
        configureFailPoint: "failCommand",
        mode: { times: 1 },
        data: { failCommands: ["update"], appName: "views-storage-late", blockConnection: true, blockTimeMS: 5000 },
      });
      await main.collection("items").bulkWrite([
        { updateOne: { filter: { _id: "1" as never }, update: { $set: { n: 2 } } } },
        { insertOne: { document: { _id: "2" as never, _part: "t1", kind: "c", n: 3 } } },
      ]);
      // The run took its numbers: they are pending in the counter of the collection
      const counters = main.collection<{ _id: string; pending?: Array<{ from: number; to: number }> }>("__storage_counters");
      let pending: { from: number; to: number } | undefined;
      await eventually(async () => {
        pending = (await counters.findOne({ _id: "sums" }))?.pending?.[0];
        expect(pending).toBeDefined();
      });
      // After the lease, the watermark of the reader passes the pending numbers of the blocked run
      let during = await reader.getChangesSince(before);
      await eventually(async () => {
        during = await reader.getChangesSince(before);
        expect(numberOf(during.version)).toBeGreaterThanOrEqual(pending!.to);
      });
      // The run did not commit at that read: its numbers are still pending, and the reader has none of its rows
      expect((await counters.findOne({ _id: "sums" }))?.pending?.some((entry) => entry.from === pending!.from)).toBe(true);
      expect(during.changed.map(([id]) => id)).toEqual([]);
      await eventually(async () => expect(await reader.get("c")).toEqual({ _id: "c", total: 3 }));
      await eventually(async () => expect(await reader.get("a")).toEqual({ _id: "a", total: 2 }));
      // The run moved to new numbers after the version of the reader: the next delta has its rows
      const after = await reader.getChangesSince(during.version);
      const changed = new Map(after.changed);
      expect(changed.get("a")).toEqual({ _id: "a", total: 2 });
      expect(changed.get("c")).toEqual({ _id: "c", total: 3 });
      const a = (await db.collection("sums").findOne({ _id: "t1a" as never }))!;
      const c = (await db.collection("sums").findOne({ _id: "t1c" as never }))!;
      expect(a["_seq"]).toBeGreaterThan(pending!.to);
      expect(a["_seq"]).toBeGreaterThan(numberOf(during.version));
      // A row keeps its place, and a new row has its own number as its place
      expect(a["_ord"]).toBe(placeOfA);
      expect(c["_ord"]).toBe(c["_seq"]);
      expect(logs.filter((line) => line.startsWith("error"))).toEqual([]);
    } finally {
      await admin.command({ configureFailPoint: "failCommand", mode: "off" });
      await views.stop();
      await own.close();
    }
  }, LOCK_WAIT_MS + 30_000);
});

withMongo("ViewMaterializer hints of a target not in a stored form", { timeout: TEST_TIMEOUT_MS }, () => {
  it("publishes one hint for each run with the ids of the run, and a reset hint at a new generation of a pass in groups", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const db = newDb();
    const hints: Array<{ topic: string; event: CollectionChangeEvent }> = [];
    const { views } = materializer(db, { maxTransactionRows: 2, publish: (topic, event) => void hints.push({ topic, event }) });
    try {
      await db.collection("items").insertMany(["a", "b"].map((kind, index) => ({ _id: String(index) as never, _part: "t1", kind, n: 1 })));
      await db.collection("_aggregations").insertOne(sumsView() as never);
      await views.start();
      // The first run is one transaction: one hint with each row
      await eventually(() => expect(hints).toHaveLength(1));
      expect(hints[0]!.topic).toBe(collectionChangeTopic("sums"));
      expect({ ...hints[0]!.event, changed: [...hints[0]!.event.changed].sort() }).toEqual({ changed: ["a", "b"], deleted: [] });
      // The target has two rows, and the run writes one: a result over the limit with few writes stays one transaction, with one hint
      await db.collection("items").insertOne({ _id: "2" as never, _part: "t1", kind: "c", n: 1 });
      await eventually(() => expect(hints).toHaveLength(2));
      expect(hints[1]).toEqual({ topic: collectionChangeTopic("sums"), event: { changed: ["c"], deleted: [] } });
      const generation = ((await statusOf(db, "sums"))!["generation"] as ObjectId).toHexString();
      // The target has three rows now, over the limit of two: the next run writes a new generation in groups, and the change of generation is a gap
      await db.collection("items").updateOne({ _id: "0" as never }, { $set: { n: 2 } });
      await eventually(() => expect(hints).toHaveLength(3));
      expect(hints[2]).toEqual({ topic: collectionChangeTopic("sums"), event: { changed: [], deleted: [], reset: true } });
      expect(((await statusOf(db, "sums"))!["generation"] as ObjectId).toHexString()).not.toBe(generation);
      // A reader of the current generation reads the whole new result
      const current = (await db.collection("_aggregations").findOne({ _id: "sums" as never })) as unknown as MaterializedView;
      const totals = (await db.collection("sums").find(viewFilter(current)).toArray()).map((row) => row["total"] as number).sort();
      expect(totals).toEqual([1, 1, 2]);
    } finally {
      await views.stop();
    }
  });

  it("publishes the removed rows of a run in one hint, on the topic of hintTopic, and nothing for a run that changes no row", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const db = newDb();
    const hints: Array<{ topic: string; event: CollectionChangeEvent }> = [];
    const { views } = materializer(db, { publish: { emit: (topic, event) => void hints.push({ topic, event }) }, hintTopic: (view, partition) => `views/${partition}/${view._id}` });
    try {
      await db.collection("items").insertMany(["a", "b"].map((kind, index) => ({ _id: String(index) as never, _part: "t1", kind, n: 1 })));
      await db.collection("_aggregations").insertOne(sumsView() as never);
      await views.start();
      await eventually(() => expect(hints).toHaveLength(1));
      const at = (await statusOf(db, "sums"))!["at"] as number;
      await sleep(5);
      await db.collection("items").updateOne({ _id: "0" as never }, { $set: { note: "not read" } });
      await eventually(async () => expect(((await statusOf(db, "sums"))!["at"] as number) > at).toBe(true));
      expect(hints).toHaveLength(1);
      await db.collection("items").deleteOne({ _id: "1" as never });
      await eventually(() => expect(hints).toHaveLength(2));
      expect(hints[1]).toEqual({ topic: "views/t1/sums", event: { changed: [], deleted: ["b"] } });
    } finally {
      await views.stop();
    }
  });
});
