/**
 * The materialized views (Graph's split plan, part P4) on a real MongoDB. Change streams need a
 * replica set: set `MONGO_TEST_URL` to one (CI has a replica-set job). On a single server, the
 * tests skip, except in the replica-set job of CI.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, type Db, type Document } from "mongodb";
import { realClock, type Clock } from "@procedures/client";
import { ViewMaterializer, type MaterializedView } from "./materializer.js";

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
  const views = new ViewMaterializer({ db: () => db, debounceMs: 20, rewatchMs: 100, log: (level, message) => void logs.push(`${level}: ${message}`) });
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

/** The stored _id of a row of a view: `{ partition, id }`. */
const at = (id: unknown, partition = "t1") => ({ partition, id });

const sorted = (docs: Document[]) => docs.sort((a, b) => JSON.stringify(a["_id"]).localeCompare(JSON.stringify(b["_id"])));

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
    expect(sorted(await target())).toEqual([{ _id: at("a"), _part: "t1", total: 3 }]);
    expect(views.openStreamCount()).toBe(2);

    await db.collection("items").insertOne({ _id: "4" as never, _part: "t1", kind: "b", n: 5 });
    await eventually(async () => expect(sorted(await target())).toEqual([{ _id: at("a"), _part: "t1", total: 3 }, { _id: at("b"), _part: "t1", total: 5 }]));
    await db.collection("items").updateOne({ _id: "1" as never }, { $set: { n: 10 } });
    await eventually(async () => expect((await db.collection("sums").findOne({ _id: at("a") as never }))?.["total"]).toBe(12));
    // A change of another partition does not reach the view
    await db.collection("items").insertOne({ _id: "5" as never, _part: "t2", kind: "c", n: 1 });
    await db.collection("items").deleteOne({ _id: "4" as never });
    await eventually(async () => expect(sorted(await target())).toEqual([{ _id: at("a"), _part: "t1", total: 12 }]));
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
    const count = async () => (await db.collection("count").findOne({ _id: at("all") as never }))?.["kinds"];
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
    expect(await db.collection("sums").find({}).toArray()).toEqual([{ _id: at("a"), _part: "t1", total: 1 }]);
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
    expect(await rows()).toEqual([{ _id: "kept", total: 0 }, { _id: at("a"), _part: "t1", total: 1 }, { _id: at("a", "t2"), _part: "t2", total: 10 }]);

    // A change of t2 rewrites only t2, and its sweep removes only rows of t2
    await db.collection("items").updateOne({ _id: "2" as never }, { $set: { kind: "b" } });
    await eventually(async () =>
      expect(await rows()).toEqual([{ _id: "kept", total: 0 }, { _id: at("a"), _part: "t1", total: 1 }, { _id: at("b", "t2"), _part: "t2", total: 10 }])
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
    const prefixed = new ViewMaterializer({ db: () => db, debounceMs: 20, rewatchMs: 100, log: () => undefined, targetId: (id, partition) => `${partition}:${String(id)}` });
    await prefixed.start();
    expect(sorted(await db.collection("sums").find({}).toArray())).toEqual([
      { _id: "t1:a", _part: "t1", total: 1 },
      { _id: "t2:a", _part: "t2", total: 10 },
    ]);
    await prefixed.stop();

    // A form without the partition: t2 cannot take the row of t1, and its view fails
    await db.collection("sums").deleteMany({});
    const bare = new ViewMaterializer({ db: () => db, debounceMs: 20, rewatchMs: 100, log: () => undefined, targetId: (id) => id });
    await bare.start();
    const rows = await db.collection("sums").find({}).toArray();
    expect(rows).toHaveLength(1);
    const winner = rows[0]!["_part"] as string;
    const states = Object.fromEntries((await db.collection("_aggregations").find({}).toArray()).map((doc) => [doc["_part"], (doc["_materializerStatus"] as Document)["state"]]));
    expect(states).toEqual({ [winner]: "ok", [winner === "t1" ? "t2" : "t1"]: "errored" });
    await bare.stop();
  });

  it("has the stop parts of a transport, and takes its timers from the injected clock", async (context) => {
    if (!replicaSet) return context.skip?.("change streams need a replica set");
    const db = client!.db(`client_mongo_views_${process.pid}_${Date.now()}_${++next}`);
    dbs.push(db);
    const delays: number[] = [];
    const clock: Clock = { now: () => realClock.now(), after: (ms, run) => (delays.push(ms), realClock.after(ms, run)) };
    const views = new ViewMaterializer({ db: () => db, debounceMs: 20, rewatchMs: 100, clock, log: () => undefined });
    await db.collection("items").insertOne({ _id: "1" as never, _part: "t1", kind: "a", n: 1 });
    await db.collection("_aggregations").insertOne(sumsView() as never);
    await views.start();
    const total = async () => (await db.collection("sums").findOne({ _id: at("a") as never }))?.["total"];
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
});
