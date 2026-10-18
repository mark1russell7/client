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

const sorted = (docs: Document[]) => docs.sort((a, b) => String(a["_id"]).localeCompare(String(b["_id"])));

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
    await eventually(async () => expect((await target()).find((row) => String(row["_id"]) === "a")?.["total"]).toBe(12));
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
    const count = async () => (await db.collection("count").findOne({ _id: "all" as never }))?.["kinds"];
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
    expect(await db.collection("sums").find({}).toArray()).toEqual([{ _id: "a", _part: "t1", total: 1 }]);
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
    const total = async () => (await db.collection("sums").findOne({ _id: "a" as never }))?.["total"];
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
