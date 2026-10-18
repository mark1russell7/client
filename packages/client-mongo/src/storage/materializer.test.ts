/**
 * The materialized views (Graph's split plan, part P4) on a real MongoDB. Change streams need a
 * replica set: set `MONGO_TEST_URL` to one (CI has a replica-set job). On a single server, the
 * tests skip, except in the replica-set job of CI.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, ObjectId, type Db, type Document } from "mongodb";
import { ms, realClock, type Clock } from "@procedures/client";
import { ViewMaterializer, viewFilter, type MaterializedView } from "./materializer.js";

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

/** A new database, a materializer on it, and a helper that waits for a condition. */
function setup() {
  const db = client!.db(`client_mongo_views_${process.pid}_${Date.now()}_${++next}`);
  dbs.push(db);
  const logs: string[] = [];
  const views = new ViewMaterializer({ db: () => db, debounce: ms(20), rewatch: ms(100), log: (level, message) => void logs.push(`${level}: ${message}`) });
  return { db, views, logs };
}

/** This function waits until the check passes, 10 s at most. */
async function eventually(check: () => Promise<void>): Promise<void> {
  const until = Date.now() + 10_000;
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

const withMongo = url ? describe : describe.skip;

withMongo("ViewMaterializer on MongoDB", () => {
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
  }, 30_000);

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
  }, 30_000);

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

  it("gives a delete only to the views of its partition, when its pre-image or its id tells the partition (CLI-37)", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const db = client!.db(`client_mongo_views_${process.pid}_${Date.now()}_${++next}`);
    dbs.push(db);
    // Each change event of a source arms the debounce once: the count of those timers is the count of the events
    let events = 0;
    const clock: Clock = { now: () => realClock.now(), after: (ms, run) => (ms === 20 && events++, realClock.after(ms, run)) };
    const views = new ViewMaterializer({ db: () => db, debounceMs: 20, rewatchMs: 100, clock, log: () => undefined });
    await db.createCollection("images", { changeStreamPreAndPostImages: { enabled: true } });
    await db.collection("images").insertMany([
      { _id: "a" as never, _part: "t1", kind: "a", n: 1 },
      { _id: "b" as never, _part: "t2", kind: "b", n: 2 },
    ]);
    // Without pre-images: the ids of MongoDocumentStorage tell the partition, and a plain id does not
    await db.collection("plain").insertMany([
      { _id: "t1\u001fa" as never, _part: "t1", kind: "a", n: 1 },
      { _id: "t2\u001fb" as never, _part: "t2", kind: "b", n: 2 },
      { _id: "x" as never, _part: "t2", kind: "x", n: 3 },
    ]);
    await db.collection("_aggregations").insertMany([
      sumsView({ _id: "from-images", collections: ["images"], targetCollection: "images_sums" }) as never,
      sumsView({ _id: "from-plain", collections: ["plain"], targetCollection: "plain_sums" }) as never,
    ]);
    await views.start();
    expect(events).toBe(0);

    // On each collection, the events come in order: a delete of t2 that passed comes before the next event
    await db.collection("images").deleteOne({ _id: "b" as never }); // t2, from the pre-image: dropped
    await db.collection("images").deleteOne({ _id: "a" as never }); // t1: passes
    await eventually(async () => expect(events).toBe(1));
    await db.collection("plain").deleteOne({ _id: "t2\u001fb" as never }); // t2, from the id: dropped
    await db.collection("plain").deleteOne({ _id: "x" as never }); // unknown: passes
    await db.collection("plain").deleteOne({ _id: "t1\u001fa" as never }); // t1: passes
    await eventually(async () => expect(events).toBe(3));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(events).toBe(3);
    await eventually(async () => expect(await db.collection("images_sums").countDocuments()).toBe(0));
    await eventually(async () => expect(await db.collection("plain_sums").countDocuments()).toBe(0));
    await views.stop();
  });
});
