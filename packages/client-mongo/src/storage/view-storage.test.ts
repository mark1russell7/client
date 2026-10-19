/**
 * `MongoViewStorage` (roadmap CLI-38): the collection procedures serve a materialized view, and each
 * reader gets one whole generation. The tests run against a real MongoDB: set `MONGO_TEST_URL`.
 * The rebuild in groups needs a replica set and the failpoints of the test commands (the
 * replica-set job of CI).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, ObjectId, type Db, type Document } from "mongodb";
import { createCollectionProcedures, invokeProcedure, ms, outputValue, type CollectionStorage, type RepositoryProvider } from "@procedures/client";
import { ViewMaterializer, type MaterializedView } from "./materializer.js";
import { MongoViewStorage } from "./view-storage.js";

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

function newName(): string {
  return `client_mongo_view_storage_${process.pid}_${Date.now()}_${++next}`;
}

function newDb(): Db {
  const db = client!.db(newName());
  dbs.push(db);
  return db;
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

/** The procedures `collections.totals.*` over a storage, as a host serves them. */
function served(storage: CollectionStorage<unknown>) {
  const procedures = createCollectionProcedures("totals");
  const repository: RepositoryProvider = {
    getStorage: <T>(_collection: string): CollectionStorage<T> => storage as unknown as CollectionStorage<T>,
    hasCollection: (name) => name === "totals",
  };
  return async (operation: string, input: unknown = {}): Promise<unknown> => {
    const procedure = procedures.find((candidate) => candidate.path[2] === operation)!;
    return outputValue(await invokeProcedure(procedure, input, { repository }), procedure.path);
  };
}

/** A row of a view as the materializer stores it, with the default `partitionTargetId`. */
const row = (generation: ObjectId, id: unknown, total: number, partition = "t1"): Document => ({
  _id: { partition, generation, id },
  _part: partition,
  _viewGen: generation,
  _viewHash: "hash",
  total,
});

/** The document of a view whose status names the generation. */
const viewDoc = (id: string, generation: ObjectId | undefined, partition = "t1"): Document => ({
  _id: id,
  _part: partition,
  collections: ["orders"],
  pipeline: [{ $group: { _id: "$kind", total: { $sum: "$n" } } }],
  targetCollection: "totals",
  _materializerStatus: { state: "ok", at: 0, ...(generation ? { generation } : {}) },
});

/** The view of the rebuild: a sum for each kind of the items, for the materializer. */
const sumsView = { _id: "totals", _part: "t1", collections: ["items"], pipeline: [{ $group: { _id: "$kind", total: { $sum: "$n" } } }], targetCollection: "totals" };

const ids = (entries: unknown): string[] => (entries as Array<{ id: string }>).map((entry) => entry.id);

const withMongo = url ? describe : describe.skip;

withMongo("MongoViewStorage on MongoDB", () => {
  it("gives each read of the procedures the rows of the current generation only, and moves at the change of generation", async () => {
    const db = newDb();
    const first = new ObjectId();
    const second = new ObjectId();
    await db.collection("_aggregations").insertMany([viewDoc("totals", first) as never, viewDoc("totals-t2", first, "t2") as never]);
    await db.collection("totals").insertMany([
      // The current generation
      row(first, "a", 1),
      row(first, "b", 2),
      row(first, "c", 3),
      // A rebuild in groups that did not change the generation yet
      row(second, "a", 10),
      row(second, "b", 20),
      row(second, "c", 30),
      row(second, "d", 40),
      // Another partition in the same generation, and a row of an older materializer
      row(first, "a", 100, "t2"),
      { _id: "a", _part: "t1", total: 1000 },
    ] as never[]);
    const run = served(new MongoViewStorage({ view: "totals", db: () => db }));
    expect(await db.collection("totals").countDocuments({ _part: "t1" })).toBe(8);

    expect(await run("getAll")).toEqual([
      { _id: "a", total: 1 },
      { _id: "b", total: 2 },
      { _id: "c", total: 3 },
    ]);
    expect(ids(await run("entries"))).toEqual(["a", "b", "c"]);
    expect(await run("ids")).toEqual(["a", "b", "c"]);
    expect(await run("size")).toBe(3);
    expect(ids(await run("find", { selector: { total: { $gt: 1 } } }))).toEqual(["b", "c"]);
    expect(await run("get", { id: "a" })).toEqual({ _id: "a", total: 1 });
    expect(await run("get", { id: "d" })).toBeUndefined();
    expect(await run("has", { id: "c" })).toBe(true);
    expect(await run("has", { id: "d" })).toBe(false);
    expect(await run("getBatch", { ids: ["c", "d", "a"] })).toEqual({ c: { _id: "c", total: 3 }, a: { _id: "a", total: 1 } });
    // The read of a change feed: no change log, so all the rows of one generation
    expect(await run("changes", {})).toEqual({ version: "", full: true, changed: [{ id: "a", value: { _id: "a", total: 1 } }, { id: "b", value: { _id: "b", total: 2 } }, { id: "c", value: { _id: "c", total: 3 } }], deleted: [] });

    // The materializer changes the generation: each reader moves to the whole new generation
    await db.collection("_aggregations").updateOne({ _id: "totals" as never }, { $set: { "_materializerStatus.generation": second } });
    expect(ids(await run("entries"))).toEqual(["a", "b", "c", "d"]);
    expect(await run("size")).toBe(4);
    expect(await run("get", { id: "d" })).toEqual({ _id: "d", total: 40 });
    expect(ids(await run("find", { selector: { total: { $gt: 15 } } }))).toEqual(["b", "c", "d"]);

    // The view of the other partition reads its own rows
    const other = new MongoViewStorage({ view: "totals-t2", db: () => db });
    expect(await other.getAll()).toEqual([{ _id: "a", total: 100 }]);
    expect(await other.getMetadata()).toEqual({ type: "custom", size: 1, stats: { view: "totals-t2" } });
  });

  it("has no row before the first generation or without its view, refuses each write, and rejects after close", async () => {
    const db = newDb();
    await db.collection("_aggregations").insertOne(viewDoc("waiting", undefined) as never);
    await db.collection("totals").insertOne(row(new ObjectId(), "a", 1) as never);
    for (const view of ["waiting", "missing"]) {
      const storage = new MongoViewStorage({ view, db: () => db });
      expect(await storage.getAll(), view).toEqual([]);
      expect(await storage.size(), view).toBe(0);
      expect(await storage.get("a"), view).toBeUndefined();
      expect(await storage.has("a"), view).toBe(false);
      expect((await storage.getBatch(["a"])).size, view).toBe(0);
    }

    const storage = new MongoViewStorage({ view: "waiting", db: () => db });
    const run = served(storage);
    for (const [operation, input] of [
      ["set", { id: "a", value: { total: 1 } }],
      ["setBatch", { items: [{ id: "a", value: {} }] }],
      ["delete", { id: "a" }],
      ["deleteBatch", { ids: ["a"] }],
      ["clear", {}],
    ] as const) {
      await expect(run(operation, input), operation).rejects.toMatchObject({ code: "FORBIDDEN", message: expect.stringContaining("read-only") });
    }
    expect(await db.collection("totals").countDocuments()).toBe(1);

    await storage.close();
    await storage.close();
    await expect(storage.getAll()).rejects.toThrow(/closed/);
    await expect(storage.set("a", {})).rejects.toThrow(/closed/);
    expect(() => new MongoViewStorage({ view: "" })).toThrow(/_id of its view/);
  });

  it("refuses a row whose _id is not a text, and reads another form of the stored _id with targetId and rowIdOf", async () => {
    const db = newDb();
    const generation = new ObjectId();
    await db.collection("_aggregations").insertMany([viewDoc("numbers", generation) as never, { ...viewDoc("prefixed", generation), targetCollection: "prefixed" } as never]);
    await db.collection("totals").insertOne(row(generation, 7, 1) as never);
    await expect(new MongoViewStorage({ view: "numbers", db: () => db }).getAll()).rejects.toThrow(/not a text/);

    // A host form of the stored _id: <partition>:<generation>:<key>
    await db.collection("prefixed").insertMany([
      { _id: `t1:${generation.toHexString()}:a`, _part: "t1", _viewGen: generation, total: 1 },
      { _id: `t1:${new ObjectId().toHexString()}:b`, _part: "t1", _viewGen: new ObjectId(), total: 2 },
    ] as never[]);
    const prefixed = new MongoViewStorage({
      view: "prefixed",
      db: () => db,
      targetId: (id, partition, gen) => `${partition}:${gen.toHexString()}:${String(id)}`,
      rowIdOf: (storedId) => String(storedId).split(":")[2],
    });
    expect(await prefixed.getEntries()).toEqual([["a", { _id: "a", total: 1 }]]);
    expect(await prefixed.get("a")).toEqual({ _id: "a", total: 1 });
    expect(await prefixed.has("b")).toBe(false);
    expect(await prefixed.find((item) => (item as { total: number }).total > 0)).toHaveLength(1);
  });

  it("serves a view that rebuilds in groups: each reader of the procedures gets one whole generation", async (context) => {
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
    const name = newName();
    const own = new MongoClient(url!, { appName: "views-cli38" });
    await own.connect();
    const db = client!.db(name);
    dbs.push(db);
    // 3 rows is more than 1: the second pass writes a new generation in groups
    const views = new ViewMaterializer({ db: () => own.db(name), debounce: ms(20), rewatch: ms(100), maxTransactionRows: 1, log: () => undefined });
    try {
      await db.collection("items").insertMany(["a", "b", "c"].map((kind, index) => ({ _id: String(index) as never, _part: "t1", kind, n: 1 })));
      await db.collection("_aggregations").insertOne(sumsView as never);
      await views.start();
      const run = served(new MongoViewStorage({ view: "totals", db: () => db }));
      expect(ids(await run("entries"))).toEqual(["a", "b", "c"]);
      const viewOf = async () => (await db.collection("_aggregations").findOne({ _id: "totals" as never })) as unknown as MaterializedView;
      const status = async () => ((await viewOf())["_materializerStatus"] ?? {}) as Document;
      const first = (await status())["generation"] as ObjectId;

      // The renewal of the lease after the first group (a findAndModify) waits 4 s: the rows of the
      // new generation are in the target, and the status still names the first generation
      await admin.command({ configureFailPoint: "failCommand", mode: { times: 1 }, data: { failCommands: ["findAndModify"], appName: "views-cli38", blockConnection: true, blockTimeMS: 4000 } });
      await db.collection("items").insertOne({ _id: "3" as never, _part: "t1", kind: "d", n: 1 });
      await eventually(async () => expect((await status())["lease"]).toBeDefined());
      const second = ((await status())["lease"] as Document)["generation"] as ObjectId;
      await eventually(async () => expect(await db.collection("totals").countDocuments({ _viewGen: second })).toBe(4));
      expect(((await status())["generation"] as ObjectId).equals(first)).toBe(true);
      // A plain read sees the rows of two generations. Each reader of the procedures sees one.
      expect(await db.collection("totals").countDocuments({ _part: "t1" })).toBe(7);
      expect(ids(await run("entries"))).toEqual(["a", "b", "c"]);
      expect(await run("getAll")).toHaveLength(3);
      expect(ids(await run("find", { selector: {} }))).toEqual(["a", "b", "c"]);
      expect(await run("size")).toBe(3);
      expect(await run("get", { id: "d" })).toBeUndefined();
      expect(ids(((await run("changes", {})) as { changed: unknown }).changed)).toEqual(["a", "b", "c"]);

      // After the change of generation, each reader gets the whole new generation
      await eventually(async () => expect(((await status())["generation"] as ObjectId).equals(second)).toBe(true));
      expect(ids(await run("entries"))).toEqual(["a", "b", "c", "d"]);
      expect(await run("size")).toBe(4);
      expect(await run("get", { id: "d" })).toEqual({ _id: "d", total: 1 });
      expect(ids(((await run("changes", {})) as { changed: unknown }).changed)).toEqual(["a", "b", "c", "d"]);
    } finally {
      await admin.command({ configureFailPoint: "failCommand", mode: "off" });
      await views.stop();
      await own.close();
    }
  }, 30_000);
});
