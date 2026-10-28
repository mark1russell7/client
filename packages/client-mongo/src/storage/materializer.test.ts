/**
 * The materialized views (Graph's split plan, part P4) on a real MongoDB. Change streams need a
 * replica set: set `MONGO_TEST_URL` to one (CI has a replica-set job). On a single server, the
 * tests skip, except in the replica-set job of CI. The tests of the logger use a fake database, so
 * they always run.
 */

import { EventEmitter } from "node:events";
import { afterAll, beforeAll, describe, expect, it, vi, type TestContext } from "vitest";
import { MongoClient, ObjectId, type Db, type Document } from "mongodb";
import { ms, realClock, type Clock } from "@procedures/client";
import { ViewMaterializer, identityPartition, viewFilter, type MaterializedView, type ViewPartitionOf, type ViewStorageSource } from "./materializer.js";
import { DEFAULT_STORED_FORM, type StoredForm } from "./document-storage.js";

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

/** The longest wait for the lock of the failpoint. A lock that is older is stale: a waiter takes it. */
const LOCK_WAIT_MS = 45_000;

/**
 * The failpoint `failCommand` and the server parameters are global to the server, and the test files
 * run at the same time. This lock (a document in a shared database) lets one test of a failpoint run
 * at a time. It ends with the test. A run that stopped while it held the lock leaves a stale lock:
 * after LOCK_WAIT_MS, a waiter takes it.
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
      // A stale lock: its test ended long ago without a release
      const stale = await locks.deleteOne({ _id: "failCommand", at: { $lt: new Date(Date.now() - LOCK_WAIT_MS) } });
      if (stale.deletedCount === 0) await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  context.onTestFinished(async () => {
    // Only this lock: a waiter may have taken it as stale
    await locks.deleteOne({ _id: "failCommand", at });
  });
}

afterAll(async () => {
  for (const db of dbs) await db.dropDatabase().catch(() => undefined);
  await client?.close();
});

/** A new database, a materializer on it, and a helper that waits for a condition. */
function setup() {
  const db = client!.db(`client_mongo_views_${process.pid}_${Date.now()}_${++next}`);
  dbs.push(db);
  const logs: string[] = [];
  const views = new ViewMaterializer({ db: () => db, debounce: ms(20), rewatch: ms(100), log: (level, message) => void logs.push(`${level}: ${message}`) });
  return { db, views, logs };
}

/** The longest wait of `eventually`. */
const EVENTUALLY_MS = 10_000;

/**
 * The time limit of each test of the suite: more than the wait of `eventually`, with room for the
 * setup. The default of vitest (5 s) cut a test before `eventually` ended, in the Coverage job of CI.
 */
const TEST_TIMEOUT_MS = 30_000;

/** This function waits until the check passes, `EVENTUALLY_MS` at most. */
async function eventually(check: () => Promise<void>): Promise<void> {
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

const sumsView = (overrides: Partial<MaterializedView> = {}): MaterializedView => ({
  _id: "sums",
  _part: "t1",
  collections: ["items"],
  pipeline: [{ $group: { _id: "$kind", total: { $sum: "$n" } } }],
  targetCollection: "sums",
  ...overrides,
});

/** A row of a view as a reader sees it: its key, its partition and its content, without the fields of the materializer. */
const plain = ({ _id, _viewGen, _viewHash, ...rest }: Document): Document => ({
  _id: typeof _id === "object" && _id !== null && "id" in (_id as Document) ? (_id as Document)["id"] : _id,
  ...rest,
});

const sorted = (docs: Document[]) => docs.map(plain).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

/** The row of a key in a target. */
const rowOf = (db: Db, collection: string, id: string, partition = "t1") => db.collection(collection).findOne({ "_id.id": id, _part: partition });

/** A fake database whose views collection has these views. Its stream of the views opens at once. */
function fakeViewsDb(views: Document[]): Db {
  const stream = new EventEmitter() as EventEmitter & { close(): Promise<void> };
  stream.close = async () => undefined;
  const collection = {
    watch: () => {
      setTimeout(() => stream.emit("resumeTokenChanged", { _data: "t0" }), 0);
      return stream;
    },
    find: () => ({ toArray: async () => views }),
  };
  return { databaseName: "fake", collection: () => collection } as unknown as Db;
}

describe("the logger of ViewMaterializer (CLI-88)", () => {
  it("writes to the logger with the context in the fields, and the logger wins over the old log", async () => {
    const lines: Array<{ level: string; message: string; fields: Record<string, unknown> }> = [];
    const logs: string[] = [];
    const views = new ViewMaterializer({
      db: () => fakeViewsDb([{ _id: "v1", collections: ["a"], pipeline: [], targetCollection: "out" }]),
      logger: { log: (level, message, fields) => void lines.push({ level, message, fields }) },
      log: (level, message) => void logs.push(`${level}: ${message}`),
    });
    await views.start();
    await views.close();
    expect(lines).toEqual([
      { level: "warn", message: "The view has no partition: it does not run", fields: { component: "materializer", view: "v1", partitionField: "_part" } },
      { level: "info", message: "Started", fields: { component: "materializer", views: 1 } },
    ]);
    expect(logs).toEqual([]);
  });

  it("keeps the old log and the old console line without a logger", async () => {
    const logs: string[] = [];
    const old = new ViewMaterializer({ db: () => fakeViewsDb([]), log: (level, message) => void logs.push(`${level}: ${message}`) });
    await old.start();
    await old.close();
    expect(logs).toEqual(["info: started: 0 view(s)"]);

    const info = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const plain = new ViewMaterializer({ db: () => fakeViewsDb([]) });
      await plain.start();
      await plain.close();
      expect(info).toHaveBeenCalledWith("[materializer] started: 0 view(s)");
    } finally {
      info.mockRestore();
    }
  });
});

const withMongo = url ? describe : describe.skip;

withMongo("ViewMaterializer on MongoDB", { timeout: TEST_TIMEOUT_MS }, () => {
  it("materializes a view for its partition, and follows inserts, updates and deletes", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const { db, views } = setup();
    await db.collection("items").insertMany([
      { _id: "1" as never, _part: "t1", kind: "a", n: 1 },
      { _id: "2" as never, _part: "t1", kind: "a", n: 2 },
      { _id: "3" as never, _part: "t2", kind: "a", n: 100 },
    ]);
    await db.collection("_aggregations").insertOne(sumsView() as never);
    await views.start();
    const target = () => db.collection("sums").find({}).toArray();
    expect(sorted(await target())).toEqual([{ _id: "a", _part: "t1", total: 3 }]);
    expect(views.openStreamCount()).toBe(2);

    await db.collection("items").insertOne({ _id: "4" as never, _part: "t1", kind: "b", n: 5 });
    await eventually(async () => expect(sorted(await target())).toEqual([{ _id: "a", _part: "t1", total: 3 }, { _id: "b", _part: "t1", total: 5 }]));
    await db.collection("items").updateOne({ _id: "1" as never }, { $set: { n: 10 } });
    await eventually(async () => expect((await rowOf(db, "sums", "a"))?.["total"]).toBe(12));
    // A change of another partition does not reach the view
    await db.collection("items").insertOne({ _id: "5" as never, _part: "t2", kind: "c", n: 1 });
    await db.collection("items").deleteOne({ _id: "4" as never });
    await eventually(async () => expect(sorted(await target())).toEqual([{ _id: "a", _part: "t1", total: 12 }]));
    const doc = await db.collection("_aggregations").findOne({ _id: "sums" as never });
    expect(doc?.["_materializerStatus"]).toMatchObject({ state: "ok" });

    await views.stop();
    expect(views.openStreamCount()).toBe(0);
    expect(views.inFlight()).toBe(0);
  });

  it("leaves out the tombstones of a source: a deleted item of a MongoDocumentStorage is no row (CLI-79)", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const { db, views } = setup();
    await db.collection("items").insertMany([
      { _id: "1" as never, _part: "t1", kind: "a", n: 1 },
      { _id: "2" as never, _part: "t1", kind: "a", n: 2 },
      { _id: "3" as never, _part: "t1", kind: "b", n: 4, _tomb: true },
    ]);
    await db.collection("_aggregations").insertOne(sumsView() as never);
    await views.start();
    const target = () => db.collection("sums").find({}).toArray();
    expect(sorted(await target())).toEqual([{ _id: "a", _part: "t1", total: 3 }]);
    // A delete of the storage replaces the document with a tombstone: its row goes
    await db.collection("items").replaceOne({ _id: "2" as never }, { _part: "t1", _key: "2", _seq: 9, _tomb: true });
    await eventually(async () => expect(sorted(await target())).toEqual([{ _id: "a", _part: "t1", total: 1 }]));
    // A document with _tomb other than true is an item
    await db.collection("items").insertOne({ _id: "4" as never, _part: "t1", kind: "b", n: 5, _tomb: false });
    await eventually(async () => expect(sorted(await target())).toEqual([{ _id: "a", _part: "t1", total: 1 }, { _id: "b", _part: "t1", total: 5 }]));
    await views.stop();
  });

  it("leaves _seq and _tomb of a source out of the rows, and keeps the other fields: a row is no write of a storage (CLI-77)", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const { db, views } = setup();
    // A document of a MongoDocumentStorage, with each field of the storage
    await db.collection("items").insertOne({ _id: "t1a" as never, _part: "t1", _key: "a", _seq: 7, _ord: 3, _kid: true, _kpf: ["kind"], _json: "x", kind: "a", n: 1 });
    // A pipeline that passes the source document through
    const pipeline = [{ $project: { _id: "$_key", _key: 1, _seq: 1, _ord: 1, _kid: 1, _kpf: 1, _json: 1, _tomb: 1, kind: 1, n: 1 } }];
    await db.collection("_aggregations").insertOne(sumsView({ _id: "copies", pipeline, targetCollection: "copies" }) as never);
    await views.start();
    const rows = await db.collection("copies").find({}).toArray();
    // A pass-through row of a _json item keeps its content, and a view can project _key
    expect(sorted(rows)).toEqual([{ _id: "a", _part: "t1", _key: "a", _ord: 3, _kid: true, _kpf: ["kind"], _json: "x", kind: "a", n: 1 }]);
    for (const name of ["_seq", "_tomb"]) expect(rows[0]).not.toHaveProperty(name);
    await views.stop();
  });

  it("runs a chain of views in one pass, marks a cycle, and resumes when the cycle ends", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const { db, views } = setup();
    await db.collection("items").insertMany([
      { _id: "1" as never, _part: "t1", kind: "a", n: 1 },
      { _id: "2" as never, _part: "t1", kind: "b", n: 2 },
    ]);
    await db.collection("_aggregations").insertMany([
      sumsView({ _id: "kinds", targetCollection: "kinds" }) as never,
      { _id: "count", _part: "t1", collections: ["kinds"], pipeline: [{ $group: { _id: "all", kinds: { $sum: 1 } } }], targetCollection: "count" } as never,
    ]);
    await views.start();
    const count = async () => (await rowOf(db, "count", "all"))?.["kinds"];
    expect(await count()).toBe(2);
    await db.collection("items").insertOne({ _id: "3" as never, _part: "t1", kind: "c", n: 3 });
    await eventually(async () => expect(await count()).toBe(3));

    // A view from count back into items closes a cycle: each of the three waits
    await db.collection("_aggregations").insertOne({ _id: "back", _part: "t1", collections: ["count"], pipeline: [{ $project: { kinds: 1 } }], targetCollection: "items" } as never);
    const states = async () =>
      Object.fromEntries((await db.collection("_aggregations").find({}).toArray()).map((doc) => [doc["_id"], (doc["_materializerStatus"] as Document | undefined)?.["state"]]));
    await eventually(async () => expect(await states()).toEqual({ kinds: "cycle", count: "cycle", back: "cycle" }));
    expect([...views.views().values()].every((view) => view.state === "cyclic")).toBe(true);

    await db.collection("_aggregations").deleteOne({ _id: "back" as never });
    await eventually(async () => expect(await states()).toEqual({ kinds: "ok", count: "ok" }));
    await db.collection("items").insertOne({ _id: "4" as never, _part: "t1", kind: "d", n: 4 });
    await eventually(async () => expect(await count()).toBe(4));
    await views.stop();
  });

  it("gives a view that fails the status errored, and runs a changed view again", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const { db, views } = setup();
    await db.collection("items").insertOne({ _id: "1" as never, _part: "t1", kind: "a", n: 1 });
    await db.collection("_aggregations").insertOne(sumsView({ pipeline: [{ $out: "elsewhere" }] }) as never);
    await views.start();
    const status = async () => (await db.collection("_aggregations").findOne({ _id: "sums" as never }))?.["_materializerStatus"] as Document | undefined;
    expect(await status()).toMatchObject({ state: "errored", lastError: expect.stringMatching(/\$out/) });

    await db.collection("_aggregations").updateOne({ _id: "sums" as never }, { $set: { pipeline: [{ $group: { _id: "$kind", total: { $sum: "$n" } } }] } });
    await eventually(async () => expect(await status()).toMatchObject({ state: "ok" }));
    expect(sorted(await db.collection("sums").find({}).toArray())).toEqual([{ _id: "a", _part: "t1", total: 1 }]);
    await views.stop();
  });

  it("opens each stream on the server before it reads: a change of a view at once after start() or during the open of a source is not lost (O63)", async (context) => {
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
    // Its own client, so the failpoint makes only the aggregates of the materializer slow: each change stream opens late
    const own = new MongoClient(url!, { appName: "views-open" });
    await own.connect();
    const name = `client_mongo_views_${process.pid}_${Date.now()}_${++next}`;
    dbs.push(client!.db(name));
    const views = new ViewMaterializer({ db: () => own.db(name), debounce: ms(20), rewatch: ms(100), log: () => undefined });
    const db = client!.db(name);
    const status = async () => (await db.collection("_aggregations").findOne({ _id: "sums" as never }))?.["_materializerStatus"] as Document | undefined;
    const sumsPipeline = [{ $group: { _id: "$kind", total: { $sum: "$n" } } }];
    try {
      await db.collection("items").insertOne({ _id: "1" as never, _part: "t1", kind: "a", n: 1 });
      await db.collection("_aggregations").insertOne(sumsView({ pipeline: [{ $out: "elsewhere" }] }) as never);
      await admin.command({ configureFailPoint: "failCommand", mode: "alwaysOn", data: { failCommands: ["aggregate"], appName: "views-open", blockConnection: true, blockTimeMS: 1000 } });
      await views.start();
      expect(await status()).toMatchObject({ state: "errored" });
      // At once: before the fix, the stream of the views opened 1 s after start(), and lost this change
      await db.collection("_aggregations").updateOne({ _id: "sums" as never }, { $set: { pipeline: sumsPipeline } });
      await eventually(async () => expect(await status()).toMatchObject({ state: "ok" }));
      expect(sorted(await db.collection("sums").find({}).toArray())).toEqual([{ _id: "a", _part: "t1", total: 1 }]);

      // A change of the view while its new source stream opens: the run of the replaced view does not start, and the last view wins
      await db.collection("_aggregations").updateOne({ _id: "sums" as never }, { $set: { targetCollection: "first" } });
      await eventually(async () => {
        expect(views.views().get("t1::sums")?.target).toBe("first");
        expect(views.openStreamCount()).toBe(2);
      });
      await db.collection("_aggregations").updateOne({ _id: "sums" as never }, { $set: { targetCollection: "last" } });
      await eventually(async () => expect(sorted(await db.collection("last").find({}).toArray())).toEqual([{ _id: "a", _part: "t1", total: 1 }]));
      expect(await status()).toMatchObject({ state: "ok" });
      expect(await db.collection("first").countDocuments()).toBe(0);
    } finally {
      await admin.command({ configureFailPoint: "failCommand", mode: "off" });
      await views.stop();
      await own.close();
    }
  }, LOCK_WAIT_MS + 30_000);

  it("does not run a view without a partition or without its fields, and a lookup outside its collections fails", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const { db, views, logs } = setup();
    await db.collection("_aggregations").insertMany([
      sumsView({ _id: "no-partition", _part: undefined as never }) as never,
      { _id: "no-fields", _part: "t1" } as never,
      sumsView({ _id: "reads-users", targetCollection: "out", pipeline: [{ $lookup: { from: "users", localField: "a", foreignField: "b", as: "x" } }] }) as never,
    ]);
    await views.start();
    expect(views.views().size).toBe(1);
    expect(logs.filter((line) => line.startsWith("warn")).length).toBe(2);
    const doc = await db.collection("_aggregations").findOne({ _id: "reads-users" as never });
    expect(doc?.["_materializerStatus"]).toMatchObject({ state: "errored", lastError: expect.stringMatching(/collections of the scope/) });
    await views.stop();
  });

  it("keeps the rows of two partitions with the same keys apart in one target, and moves the rows of an older form", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const { db, views } = setup();
    await db.collection("items").insertMany([
      { _id: "1" as never, _part: "t1", kind: "a", n: 1 },
      { _id: "2" as never, _part: "t2", kind: "a", n: 10 },
    ]);
    // The rows of an older materializer: the plain key as _id (the second partition could not even exist)
    await db.collection("sums").insertMany([
      { _id: "a" as never, _part: "t1", total: 1 },
      { _id: "gone" as never, _part: "t1", total: 9 },
      { _id: "kept" as never, total: 0 }, // no partition: not a row of a view
    ]);
    await db.collection("_aggregations").insertMany([sumsView() as never, sumsView({ _id: "sums-t2", _part: "t2" }) as never]);
    await views.start();
    const rows = async () => sorted(await db.collection("sums").find({}).toArray());
    expect(await rows()).toEqual([{ _id: "a", _part: "t1", total: 1 }, { _id: "a", _part: "t2", total: 10 }, { _id: "kept", total: 0 }]);

    // A change of t2 rewrites only t2, and its sweep removes only rows of t2
    await db.collection("items").updateOne({ _id: "2" as never }, { $set: { kind: "b" } });
    await eventually(async () =>
      expect(await rows()).toEqual([{ _id: "a", _part: "t1", total: 1 }, { _id: "b", _part: "t2", total: 10 }, { _id: "kept", total: 0 }])
    );
    const statuses = (await db.collection("_aggregations").find({}).toArray()).map((doc) => (doc["_materializerStatus"] as Document | undefined)?.["state"]);
    expect(statuses).toEqual(["ok", "ok"]);
    await views.stop();
  });

  it("takes the stored _id of a row from targetId, and refuses to write over the row of another partition", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const db = client!.db(`client_mongo_views_${process.pid}_${Date.now()}_${++next}`);
    dbs.push(db);
    await db.collection("items").insertMany([
      { _id: "1" as never, _part: "t1", kind: "a", n: 1 },
      { _id: "2" as never, _part: "t2", kind: "a", n: 10 },
    ]);
    await db.collection("_aggregations").insertMany([sumsView() as never, sumsView({ _id: "sums-t2", _part: "t2" }) as never]);
    // A host form: <partition>:<key>
    const prefixed = new ViewMaterializer({ db: () => db, debounce: ms(20), rewatch: ms(100), log: () => undefined, targetId: (id, partition) => `${partition}:${String(id)}` });
    await prefixed.start();
    expect(sorted(await db.collection("sums").find({}).toArray())).toEqual([
      { _id: "t1:a", _part: "t1", total: 1 },
      { _id: "t2:a", _part: "t2", total: 10 },
    ]);
    await prefixed.stop();

    // A form without the partition: t2 cannot take the row of t1, and its view fails
    await db.collection("sums").deleteMany({});
    const bare = new ViewMaterializer({ db: () => db, debounce: ms(20), rewatch: ms(100), log: () => undefined, targetId: (id) => id });
    await bare.start();
    const rows = await db.collection("sums").find({}).toArray();
    expect(rows).toHaveLength(1);
    const winner = rows[0]!["_part"] as string;
    const states = Object.fromEntries((await db.collection("_aggregations").find({}).toArray()).map((doc) => [doc["_part"], (doc["_materializerStatus"] as Document)["state"]]));
    expect(states).toEqual({ [winner]: "ok", [winner === "t1" ? "t2" : "t1"]: "errored" });
    await bare.stop();
  });

  it("writes a large view as a new generation in groups, keeps the previous one for its grace time, and reads only current generations downstream", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const db = client!.db(`client_mongo_views_${process.pid}_${Date.now()}_${++next}`);
    dbs.push(db);
    const logs: string[] = [];
    const views = new ViewMaterializer({ db: () => db, debounce: ms(20), rewatch: ms(100), maxTransactionRows: 1, generationGrace: ms(2000), log: (level, message) => void logs.push(`${level}: ${message}`) });
    await db.collection("items").insertMany(["a", "b", "c"].map((kind, index) => ({ _id: String(index) as never, _part: "t1", kind, n: 1 })));
    await db.collection("_aggregations").insertMany([
      sumsView() as never,
      { _id: "count", _part: "t1", collections: ["sums"], pipeline: [{ $group: { _id: "all", kinds: { $sum: 1 } } }], targetCollection: "count" } as never,
    ]);
    await views.start();
    const viewOf = async (id: string) => (await db.collection("_aggregations").findOne({ _id: id as never })) as unknown as MaterializedView;
    /** The rows that a reader sees: the current generation only. */
    const current = async (id: string, target: string) => sorted(await db.collection(target).find(viewFilter(await viewOf(id))).toArray());
    const statusOf = async (id: string) => (await viewOf(id))["_materializerStatus"] as Document;
    expect(await current("sums", "sums")).toHaveLength(3);
    expect(await current("count", "count")).toEqual([{ _id: "all", _part: "t1", kinds: 3 }]);
    const first = (await statusOf("sums"))["generation"] as ObjectId;
    // The first generation gets older than the grace time (and than the second of its ObjectId)
    await new Promise((resolve) => setTimeout(resolve, 3200));

    // 3 rows is more than 1: the next pass writes a new generation in groups, and the readers move to it at once
    await db.collection("items").insertOne({ _id: "3" as never, _part: "t1", kind: "d", n: 1 });
    await eventually(async () => expect(await current("sums", "sums")).toHaveLength(4));
    const status = await statusOf("sums");
    expect((status["generation"] as ObjectId).equals(first)).toBe(false);
    expect((status["previous"] as Document)["generation"]).toEqual(first);
    // The time of the change is the time of the server
    expect((status["previous"] as Document)["flippedAt"]).toBeInstanceOf(Date);
    await eventually(async () => expect(await current("count", "count")).toEqual([{ _id: "all", _part: "t1", kinds: 4 }]));

    // A pass in the grace time keeps the previous generation, although it is old; the view that reads the target counts the current one only
    await db.collection("items").insertOne({ _id: "4" as never, _part: "t1", kind: "e", n: 1 });
    await eventually(async () => expect(await current("sums", "sums")).toHaveLength(5));
    expect(await db.collection("sums").countDocuments({ _viewGen: first })).toBe(3);
    await eventually(async () => expect(await current("count", "count")).toEqual([{ _id: "all", _part: "t1", kinds: 5 }]));
    // At the end of the grace time, it goes with no other change
    await eventually(async () => expect(await db.collection("sums").countDocuments({ _viewGen: first })).toBe(0));
    expect(logs.filter((line) => line.startsWith("warn"))).toEqual([]);
    await views.stop();
  }, 30_000);

  it("fails a pass in groups when targetId gives the same _id in each generation", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const db = client!.db(`client_mongo_views_${process.pid}_${Date.now()}_${++next}`);
    dbs.push(db);
    const views = new ViewMaterializer({ db: () => db, debounce: ms(20), rewatch: ms(100), maxTransactionRows: 1, targetId: (id, partition) => `${partition}:${String(id)}`, log: () => undefined });
    await db.collection("items").insertMany(["a", "b"].map((kind, index) => ({ _id: String(index) as never, _part: "t1", kind, n: 1 })));
    await db.collection("_aggregations").insertOne(sumsView() as never);
    await views.start();
    const status = async () => (await db.collection("_aggregations").findOne({ _id: "sums" as never }))?.["_materializerStatus"] as Document;
    expect(await status()).toMatchObject({ state: "ok" });
    await db.collection("items").insertOne({ _id: "2" as never, _part: "t1", kind: "c", n: 1 });
    await eventually(async () => expect(await status()).toMatchObject({ state: "errored", lastError: expect.stringMatching(/same _id in each generation/) }));
    // The rows of the current generation stay as they were
    expect(sorted(await db.collection("sums").find({}).toArray()).map((row) => row["_id"])).toEqual(["t1:a", "t1:b"]);
    await views.stop();
  });

  it("writes in groups when its transaction goes over the lifetime limit of the server", async (context) => {
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
    // Its own client, so the failpoint blocks only the commands of the materializer
    const own = new MongoClient(url!, { appName: "views-lifetime" });
    await own.connect();
    const db = own.db(`client_mongo_views_${process.pid}_${Date.now()}_${++next}`);
    dbs.push(client!.db(db.databaseName));
    const logs: string[] = [];
    const views = new ViewMaterializer({ db: () => db, debounce: ms(20), rewatch: ms(100), log: (level, message) => void logs.push(`${level}: ${message}`) });
    await db.collection("items").insertMany(["a", "b", "c"].map((kind, index) => ({ _id: String(index) as never, _part: "t1", kind, n: 1 })));
    await db.collection("_aggregations").insertOne(sumsView() as never);
    await admin.command({ setParameter: 1, transactionLifetimeLimitSeconds: 1 });
    try {
      // The first write of the run waits 3 s in its transaction: the server aborts the transaction
      await admin.command({ configureFailPoint: "failCommand", mode: { times: 1 }, data: { failCommands: ["update"], appName: "views-lifetime", blockConnection: true, blockTimeMS: 3000 } });
      await views.start();
      const viewOf = async () => (await db.collection("_aggregations").findOne({ _id: "sums" as never })) as unknown as MaterializedView;
      expect(sorted(await db.collection("sums").find(viewFilter(await viewOf())).toArray())).toHaveLength(3);
      expect((await viewOf())["_materializerStatus"]).toMatchObject({ state: "ok" });
      expect(logs.some((line) => line.startsWith("warn") && line.includes("the transaction failed"))).toBe(true);
    } finally {
      await admin.command({ configureFailPoint: "failCommand", mode: "off" });
      await admin.command({ setParameter: 1, transactionLifetimeLimitSeconds: 60 });
      await views.stop();
      await own.close();
    }
  }, LOCK_WAIT_MS + 30_000);

  it("gives way to the live lease of another process, keeps the rows of its generation, and removes them when the lease ends", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const db = client!.db(`client_mongo_views_${process.pid}_${Date.now()}_${++next}`);
    dbs.push(db);
    const logs: string[] = [];
    const views = new ViewMaterializer({ db: () => db, debounce: ms(20), rewatch: ms(100), log: (level, message) => void logs.push(`${level}: ${message}`) });
    await db.collection("items").insertMany(["a", "b"].map((kind, index) => ({ _id: String(index) as never, _part: "t1", kind, n: 1 })));
    await db.collection("_aggregations").insertOne(sumsView() as never);
    await views.start();
    const viewOf = async () => (await db.collection("_aggregations").findOne({ _id: "sums" as never })) as unknown as MaterializedView;
    const status = async () => (await viewOf())["_materializerStatus"] as Document;
    const first = (await status())["generation"] as ObjectId;

    // Another process writes a new generation in groups, under its live lease
    const other = new ObjectId();
    await db.collection("sums").insertOne({ _id: { partition: "t1", generation: other, id: "zz" } as never, _part: "t1", _viewGen: other, total: 9 });
    await db.collection("_aggregations").updateOne({ _id: "sums" as never }, [
      { $set: { "_materializerStatus.lease": { owner: "other", generation: other, until: { $add: ["$$NOW", 60_000] } } } },
    ]);
    await db.collection("items").insertOne({ _id: "2" as never, _part: "t1", kind: "c", n: 1 });
    await eventually(async () => expect(logs.some((line) => line.includes("a pass of another process holds the view"))).toBe(true));
    // This process leaves the view, the generation and the rows of the lease alone
    expect(((await status())["generation"] as ObjectId).equals(first)).toBe(true);
    expect(await db.collection("sums").countDocuments({ _viewGen: other })).toBe(1);
    expect((await status())["state"]).toBe("ok");

    // The lease ends (the other process stopped): the view runs again, and the rows of that pass go
    await db.collection("_aggregations").updateOne({ _id: "sums" as never }, [{ $set: { "_materializerStatus.lease.until": { $subtract: ["$$NOW", 1] } } }]);
    await eventually(async () => expect(sorted(await db.collection("sums").find(viewFilter(await viewOf())).toArray())).toHaveLength(3));
    await eventually(async () => expect(await db.collection("sums").countDocuments({ _viewGen: other })).toBe(0));
    await views.stop();
  });

  it("keeps one view under two processes: a slow pass in groups keeps its rows, and a pass whose generation changed does not flip", async (context) => {
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
    const name = `client_mongo_views_${process.pid}_${Date.now()}_${++next}`;
    const clientA = new MongoClient(url!, { appName: "views-a" });
    const clientB = new MongoClient(url!, { appName: "views-b" });
    await Promise.all([clientA.connect(), clientB.connect()]);
    dbs.push(client!.db(name));
    const logs: string[] = [];
    const options = { debounce: ms(20), rewatch: ms(100), maxTransactionRows: 1, log: (level: string, message: string) => void logs.push(`${level}: ${message}`) };
    const a = new ViewMaterializer({ db: () => clientA.db(name), ...options });
    const b = new ViewMaterializer({ db: () => clientB.db(name), ...options });
    const db = client!.db(name);
    try {
      await db.collection("items").insertMany(["a", "b", "c"].map((kind, index) => ({ _id: String(index) as never, _part: "t1", kind, n: 1 })));
      await db.collection("_aggregations").insertOne(sumsView() as never);
      await a.start();
      const viewOf = async () => (await db.collection("_aggregations").findOne({ _id: "sums" as never })) as unknown as MaterializedView;
      const status = async () => (await viewOf())["_materializerStatus"] as Document;
      // The renewal of the lease of A (a findAndModify) waits 4 s: A is slow, after its rows are written
      await admin.command({ configureFailPoint: "failCommand", mode: { times: 1 }, data: { failCommands: ["findAndModify"], appName: "views-a", blockConnection: true, blockTimeMS: 4000 } });
      await db.collection("items").insertOne({ _id: "3" as never, _part: "t1", kind: "d", n: 1 });
      await eventually(async () => expect((await status())["lease"]).toBeDefined());
      const leased = ((await status())["lease"] as Document)["generation"] as ObjectId;
      await eventually(async () => expect(await db.collection("sums").countDocuments({ _viewGen: leased })).toBe(4));

      // B starts in the meantime: it gives way to the lease, and the rows of A stay
      await b.start();
      expect(await db.collection("sums").countDocuments({ _viewGen: leased })).toBe(4);
      // A newer generation takes the view while A waits: the flip of A is a compare-and-set, so it gives way
      const newer = new ObjectId();
      await db.collection("_aggregations").updateOne({ _id: "sums" as never }, { $set: { "_materializerStatus.generation": newer } });
      await eventually(async () => expect(logs.some((line) => line.includes("a newer generation took the view"))).toBe(true));
      expect(((await status())["generation"] as ObjectId).equals(newer)).toBe(true);

      // The view comes back to one whole generation, and the rows of the superseded pass go
      await eventually(async () => expect(sorted(await db.collection("sums").find(viewFilter(await viewOf())).toArray())).toHaveLength(4));
      await eventually(async () => expect(await db.collection("sums").countDocuments({ _viewGen: leased })).toBe(0));
      expect((await status())["state"]).not.toBe("errored");
    } finally {
      await admin.command({ configureFailPoint: "failCommand", mode: "off" });
      await a.stop();
      await b.stop();
      await Promise.all([clientA.close(), clientB.close()]);
    }
  }, LOCK_WAIT_MS + 30_000);

  it("has the stop parts of a transport, and takes its timers from the injected clock", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const db = client!.db(`client_mongo_views_${process.pid}_${Date.now()}_${++next}`);
    dbs.push(db);
    const delays: number[] = [];
    const clock: Clock = { now: () => realClock.now(), after: (ms, run) => (delays.push(ms), realClock.after(ms, run)) };
    const views = new ViewMaterializer({ db: () => db, debounce: ms(20), rewatch: ms(100), clock, log: () => undefined });
    await db.collection("items").insertOne({ _id: "1" as never, _part: "t1", kind: "a", n: 1 });
    await db.collection("_aggregations").insertOne(sumsView() as never);
    await views.start();
    const total = async () => (await rowOf(db, "sums", "a"))?.["total"];
    await db.collection("items").insertOne({ _id: "2" as never, _part: "t1", kind: "a", n: 2 });
    await eventually(async () => expect(await total()).toBe(3));
    expect(delays).toContain(20); // the debounce of the pass is a timer of the clock

    views.stopIntake();
    await db.collection("items").insertOne({ _id: "3" as never, _part: "t1", kind: "a", n: 4 });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await total()).toBe(3); // no pass after stopIntake()
    await views.drain(clock.now() + 1000);
    expect(views.inFlight()).toBe(0);
    await views.close();
    expect(views.openStreamCount()).toBe(0);
  });

  /** A materializer whose clock counts the change events of the sources: each event arms the debounce once. */
  function counting(db: Db, options: { storageSources?: Record<string, ViewPartitionOf | ViewStorageSource> } = {}) {
    const counter = { events: 0 };
    const clock: Clock = { now: () => realClock.now(), after: (ms, run) => (ms === 20 && counter.events++, realClock.after(ms, run)) };
    const views = new ViewMaterializer({ db: () => db, debounce: ms(20), rewatch: ms(100), clock, log: () => undefined, ...options });
    return { views, counter };
  }

  function newDb(): Db {
    const db = client!.db(`client_mongo_views_${process.pid}_${Date.now()}_${++next}`);
    dbs.push(db);
    return db;
  }

  /** This function waits until the count is right, and checks that no later event comes. */
  async function settles(counter: { events: number }, count: number): Promise<void> {
    await eventually(async () => expect(counter.events).toBe(count));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(counter.events).toBe(count);
  }

  it("gives a change only to the views of its partition when its pre-image tells the partition (CLI-37)", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const db = newDb();
    const { views, counter } = counting(db);
    await db.createCollection("images", { changeStreamPreAndPostImages: { enabled: true } });
    await db.collection("images").insertMany([
      { _id: "a" as never, _part: "t1", kind: "a", n: 1 },
      { _id: "b" as never, _part: "t2", kind: "b", n: 2 },
      { _id: "m" as never, _part: "t1", kind: "m", n: 3 },
    ]);
    // Without pre-images and without a mapping, a delete passes: even an id that looks like the id of another partition
    await db.collection("plain").insertMany([
      { _id: "t2\u001fc" as never, _part: "t1", kind: "c", n: 1 },
      { _id: "d" as never, _part: "t2", kind: "d", n: 1 },
    ]);
    await db.collection("_aggregations").insertMany(
      ["images", "plain"].map((source) => sumsView({ _id: `from-${source}`, collections: [source], targetCollection: `${source}_sums` })) as never[]
    );
    await views.start();
    expect(counter.events).toBe(0);
    expect(await db.collection("images_sums").countDocuments()).toBe(2);

    // On each collection, the events come in order: a change of t2 that passed comes before the next event
    await db.collection("images").deleteOne({ _id: "b" as never }); // t2, from the pre-image: dropped
    await db.collection("images").deleteOne({ _id: "a" as never }); // t1: passes
    await eventually(async () => expect(counter.events).toBe(1));
    await db.collection("images").updateOne({ _id: "m" as never }, { $set: { _part: "t2" } }); // moves out of t1: passes
    await eventually(async () => expect(counter.events).toBe(2));
    await db.collection("plain").deleteOne({ _id: "d" as never }); // t2, but unknown: passes
    await db.collection("plain").deleteOne({ _id: "t2\u001fc" as never }); // t1: passes
    await settles(counter, 4);
    // The view of t1 lost the moved document too
    for (const target of ["images_sums", "plain_sums"]) {
      await eventually(async () => expect(await db.collection(target).countDocuments(), target).toBe(0));
    }
    await views.stop();
  });

  it("reads the partition of a delete from a storage id through the mapping of its source, and passes it without one (CLI-37)", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    /** The storage partitions are boards of a tenant (acme:board1), and the views are per tenant (acme). */
    const scenario = async (storageSources: Record<string, ViewPartitionOf> | undefined, expected: number, storagePartitionOf = (tenant: string) => `${tenant}:board1`) => {
      const db = newDb();
      const { views, counter } = counting(db, storageSources ? { storageSources } : {});
      const acme = `${storagePartitionOf("acme")}\u001fx`;
      const beta = `${storagePartitionOf("beta")}\u001fy`;
      await db.collection("stored").insertMany([
        { _id: acme as never, _part: "acme", kind: "x", n: 1 },
        { _id: beta as never, _part: "beta", kind: "y", n: 1 },
        { _id: "z" as never, _part: "beta", kind: "z", n: 1 },
      ]);
      await db.collection("_aggregations").insertOne(sumsView({ _part: "acme", collections: ["stored"] }) as never);
      await views.start();
      await db.collection("stored").deleteOne({ _id: beta as never }); // beta: dropped with the mapping
      await db.collection("stored").deleteOne({ _id: "z" as never }); // no storage partition: passes
      await db.collection("stored").deleteOne({ _id: acme as never }); // acme: passes
      await settles(counter, expected);
      await eventually(async () => expect(await db.collection("sums").countDocuments()).toBe(0));
      await views.stop();
    };
    await scenario({ stored: (storagePartition) => storagePartition.split(":")[0] }, 2);
    await scenario(undefined, 3);
    // A mapping that does not know the partition, or fails, drops nothing
    await scenario({ stored: () => undefined }, 3);
    await scenario({ stored: () => { throw new Error("no"); } }, 3);
    // identityPartition is for a storage partition that is the partition of the views (acme, not acme:board1)
    await scenario({ stored: identityPartition }, 2, (tenant) => tenant);
  }, 60_000);

  it("reads the partition of a delete with the partitionOf of the stored form of its source, without pre-images (CLI-76)", async (context) => {
    // A form of an app: the stored _id is `<scope>|<tenant>:<id>`, so the documentKey of a delete tells the partition `<tenant>/<scope>`
    const form: Pick<StoredForm, "partitionOf"> = {
      partitionOf: (doc) => {
        const id: unknown = doc["_id"];
        const match = typeof id === "string" ? /^([^|]+)\|([^:]+):/.exec(id) : null;
        return match ? `${match[2]}/${match[1]}` : undefined;
      },
    };
    const tenantOf: ViewPartitionOf = (storagePartition) => storagePartition.split("/")[0];
    expect(() => new ViewMaterializer({ db: () => undefined as never, storageSources: { s: { form: {}, viewPartitionOf: tenantOf } as never } })).toThrow(TypeError);
    expect(() => new ViewMaterializer({ db: () => undefined as never, storageSources: { s: { form: DEFAULT_STORED_FORM } as never } })).toThrow(TypeError);
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const scenario = async (storageSources: Record<string, ViewPartitionOf | ViewStorageSource> | undefined, expected: number) => {
      const db = newDb();
      const { views, counter } = counting(db, storageSources ? { storageSources } : {});
      await db.collection("stored").insertMany([
        { _id: "board:1|acme:x" as never, _part: "acme", kind: "x", n: 1 },
        { _id: "board:1|beta:y" as never, _part: "beta", kind: "y", n: 1 },
        { _id: 5 as never, _part: "beta", kind: "z", n: 1 },
      ]);
      await db.collection("_aggregations").insertOne(sumsView({ _part: "acme", collections: ["stored"] }) as never);
      await views.start();
      await db.collection("stored").deleteOne({ _id: "board:1|beta:y" as never }); // beta: dropped with the form
      await db.collection("stored").deleteOne({ _id: 5 as never }); // the form does not tell it: passes
      await db.collection("stored").deleteOne({ _id: "board:1|acme:x" as never }); // acme: passes
      await settles(counter, expected);
      await eventually(async () => expect(await db.collection("sums").countDocuments()).toBe(0));
      await views.stop();
    };
    await scenario({ stored: { form, viewPartitionOf: tenantOf } }, 2);
    // Without the form, the default form reads the part before U+001F: these ids do not tell it, and each delete passes
    await scenario({ stored: tenantOf }, 3);
    await scenario(undefined, 3);
  }, 60_000);

  it("with sourceFields, starts a pass for an update that sets or removes a field of the view or changes the partition", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const db = newDb();
    const { views, counter } = counting(db);
    // The move out of the partition needs the pre-image
    await db.createCollection("items", { changeStreamPreAndPostImages: { enabled: true } });
    await db.collection("items").insertOne({ _id: "1" as never, _part: "t1", kind: "a", n: 1, note: "x" });
    await db.collection("_aggregations").insertOne(sumsView({ sourceFields: { items: ["kind", "n"] } }) as never);
    await views.start();
    await db.collection("items").updateOne({ _id: "1" as never }, { $set: { note: "y" } }); // no field of the view: dropped
    await db.collection("items").updateOne({ _id: "1" as never }, { $unset: { n: "" } }); // removes n: passes
    await eventually(async () => expect(counter.events).toBe(1));
    await eventually(async () => expect((await rowOf(db, "sums", "a"))?.["total"]).toBe(0));
    await db.collection("items").updateOne({ _id: "1" as never }, { $set: { _part: "t2" } }); // leaves t1: passes
    await settles(counter, 2);
    await eventually(async () => expect(await db.collection("sums").countDocuments()).toBe(0));
    await views.stop();
  });

  it("with sourceFields, reads the dotted keys of an update: a $push, a dotted $set, a removal, a parent and a truncated array", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const db = newDb();
    const { views, counter } = counting(db);
    await db.collection("items").insertOne({ _id: "1" as never, _part: "t1", kind: "a", n: 1, tags: ["x"], a: { b: 1, c: 1 }, note: "x" });
    await db.collection("_aggregations").insertOne(sumsView({ sourceFields: { items: ["tags", "a.b"] } }) as never);
    await views.start();
    const items = db.collection("items");
    const one = { _id: "1" as never };
    // On one collection the events come in order: a dropped update before each update that passes
    await items.updateOne(one, { $set: { note: "y" } }); // no field of the view: dropped
    await items.updateOne(one, { $push: { tags: "y" } } as never); // the key tags.1, under tags: passes
    await eventually(async () => expect(counter.events).toBe(1));
    await items.updateOne(one, { $set: { "a.c": 2 } }); // a.c is not a.b: dropped
    await items.updateOne(one, { $set: { "a.b": 2 } }); // the key a.b: passes
    await eventually(async () => expect(counter.events).toBe(2));
    await items.updateOne(one, { $unset: { "a.b": "" } }); // a removal of a.b: passes
    await eventually(async () => expect(counter.events).toBe(3));
    await items.updateOne(one, { $set: { a: { b: 5 } } }); // the key a, above a.b: passes
    await eventually(async () => expect(counter.events).toBe(4));
    await items.updateOne(one, { $push: { tags: { $each: ["z", "w"] } } } as never);
    await eventually(async () => expect(counter.events).toBe(5));
    // A shorter array (a pipeline update): a truncated array, or the whole field
    await items.updateOne(one, [{ $set: { tags: { $slice: ["$tags", 1] } } }]);
    await settles(counter, 6);
    await views.stop();
  });

  it("with sourceFields, matches a path into an array of subdocuments at each position", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const db = newDb();
    const { views, counter } = counting(db);
    await db.collection("items").insertOne({ _id: "1" as never, _part: "t1", kind: "a", n: 1, lines: [{ price: 1, note: "a" }] });
    await db.collection("_aggregations").insertOne(sumsView({ sourceFields: { items: ["lines.price"] } }) as never);
    await views.start();
    const items = db.collection("items");
    const one = { _id: "1" as never };
    await items.updateOne(one, { $set: { "lines.0.note": "b" } }); // lines.0.note is lines.note: dropped
    await items.updateOne(one, { $set: { "lines.0.price": 2 } }); // lines.0.price is lines.price: passes
    await eventually(async () => expect(counter.events).toBe(1));
    await items.updateOne(one, { $push: { lines: { price: 3 } } } as never); // lines.1 is lines, above lines.price: passes
    await eventually(async () => expect(counter.events).toBe(2));
    await items.updateOne(one, { $set: { "lines.0": { price: 4 } } }); // lines.0 is lines: passes
    await settles(counter, 3);
    await views.stop();
  });

  it("gives an update of the partition field without a pre-image to the views of each partition", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const db = newDb();
    const { views, counter } = counting(db);
    // No pre-images: the event has only the document after the change, in t2
    await db.collection("items").insertMany([
      { _id: "1" as never, _part: "t1", kind: "a", n: 1 },
      { _id: "2" as never, _part: "t2", kind: "b", n: 1 },
    ]);
    await db.collection("_aggregations").insertOne(sumsView() as never);
    await views.start();
    await db.collection("items").updateOne({ _id: "2" as never }, { $set: { n: 5 } }); // t2, not the partition field: dropped
    await db.collection("items").updateOne({ _id: "1" as never }, { $set: { _part: "t2" } }); // leaves t1: passes
    await settles(counter, 1);
    // The view of t1 lost the document
    await eventually(async () => expect(await db.collection("sums").countDocuments({ _part: "t1", _viewGen: { $exists: true } })).toBe(0));
    await views.stop();
  });
});
