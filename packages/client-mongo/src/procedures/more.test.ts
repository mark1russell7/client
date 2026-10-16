/**
 * mongo.documents.distinct, mongo.documents.bulk, mongo.documents.explain and mongo.watch
 * (roadmap R44), against the in-memory fake of the driver.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createRegistry, invokePath, outputItems, outputValue, type ProcedurePath } from "@procedures/client";
import { mongoModule } from "../module.js";
import { setDefaultConnection } from "../connection.js";
import { FakeServer, fakeConnection } from "../../test/fake-mongo.js";
import { toWatchChange } from "./watch.js";
import type { WatchChange } from "./watch.js";

const registry = createRegistry(mongoModule);

async function call<T = Record<string, unknown>>(operation: string, input: unknown, metadata?: Record<string, unknown>): Promise<T> {
  const path: ProcedurePath = ["mongo", ...operation.split(".")];
  return outputValue(await invokePath<T>(path, input, { registry, metadata }), path);
}

let server: FakeServer;

beforeEach(() => {
  server = new FakeServer();
  setDefaultConnection(fakeConnection(server));
  server.docs("test", "users").push(
    { _id: "a", name: "Ann", team: "red", tags: ["x", "y"] },
    { _id: "b", name: "Bob", team: "blue", tags: ["y"] },
    { _id: "c", name: "Cy", team: "red" },
  );
});

describe("the effects of the R44 procedures", () => {
  it("are declared", () => {
    const effects = Object.fromEntries(mongoModule.procedures.map((procedure) => [procedure.path.join("."), procedure.metadata.effects]));
    expect(effects["mongo.documents.distinct"]).toEqual({ reads: ["mongo", "network"], writes: [] });
    expect(effects["mongo.documents.explain"]).toEqual({ reads: ["mongo", "network"], writes: [] });
    expect(effects["mongo.documents.bulk"]).toEqual({ reads: ["mongo", "network"], writes: ["mongo", "network"] });
    expect(effects["mongo.watch"]).toEqual({ reads: ["mongo", "network"], writes: [] });
    expect(mongoModule.procedures.find((procedure) => procedure.path.join(".") === "mongo.watch")?.metadata["stream"]).toEqual({ unbounded: true });
  });
});

describe("mongo.documents.distinct (R44)", () => {
  it("gives the distinct values of a field, and the elements of an array field", async () => {
    expect(await call("documents.distinct", { collection: "users", field: "team" })).toEqual({ values: ["red", "blue"] });
    expect(await call("documents.distinct", { collection: "users", field: "tags" })).toEqual({ values: ["x", "y"] });
    expect(await call("documents.distinct", { collection: "users", field: "name", query: { team: "red" } })).toEqual({ values: ["Ann", "Cy"] });
  });

  it("needs a field and a collection", async () => {
    await expect(call("documents.distinct", { collection: "users" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(call("documents.distinct", { field: "team" })).rejects.toThrow(/collection/);
  });
});

describe("mongo.documents.bulk (R44)", () => {
  it("runs the five operations in order, and gives the counts and the ids", async () => {
    const result = await call<Record<string, unknown>>("documents.bulk", {
      collection: "users",
      operations: [
        { insertOne: { document: { _id: "d", name: "Di", team: "blue" } } },
        { updateOne: { filter: { _id: "a" }, update: { $set: { team: "blue" } } } },
        { updateMany: { filter: { team: "blue" }, update: { $set: { level: 2 } } } },
        { updateOne: { filter: { _id: "z" }, update: { $set: { name: "Zed" } }, upsert: true } },
        { deleteOne: { filter: { _id: "c" } } },
        { deleteMany: { filter: { team: "none" } } },
      ],
    });
    expect(result).toEqual({
      ok: true,
      insertedCount: 1,
      matchedCount: 4,
      modifiedCount: 4,
      deletedCount: 1,
      upsertedCount: 1,
      insertedIds: { "0": "d" },
      upsertedIds: { "3": "z" },
    });
    const docs = server.docs("test", "users");
    expect(docs.map((doc) => doc["_id"])).toEqual(["a", "b", "d", "z"]);
    expect(docs.filter((doc) => doc["level"] === 2).map((doc) => doc["_id"])).toEqual(["a", "b", "d"]);
  });

  it("stops at the first failure in order, and runs the rest with ordered: false", async () => {
    const operations = [
      { updateOne: { filter: { _id: "a" }, update: { name: "no operator" } } },
      { insertOne: { document: { _id: "e", name: "Ed" } } },
    ];
    await expect(call("documents.bulk", { collection: "users", operations })).rejects.toThrow(/atomic operators/);
    expect(server.docs("test", "users").some((doc) => doc["_id"] === "e")).toBe(false);
    await expect(call("documents.bulk", { collection: "users", operations, ordered: false })).rejects.toMatchObject({ name: "MongoBulkWriteError" });
    expect(server.docs("test", "users").some((doc) => doc["_id"] === "e")).toBe(true);
  });

  it("refuses an empty filter of an update or a delete without confirm: true", async () => {
    for (const operation of [
      { deleteMany: { filter: {} } },
      { deleteOne: { filter: {} } },
      { updateMany: { filter: {}, update: { $set: { x: 1 } } } },
    ]) {
      await expect(call("documents.bulk", { collection: "users", operations: [operation] })).rejects.toThrow(/operations\[0\]\.\w+: an empty filter.*confirm: true/);
    }
    expect(server.docs("test", "users")).toHaveLength(3);
    const result = await call<{ deletedCount: number }>("documents.bulk", { collection: "users", operations: [{ deleteMany: { filter: {} } }], confirm: true });
    expect(result.deletedCount).toBe(3);
  });

  it("refuses an input that is not a list of known operations", async () => {
    const refused: Array<[unknown, RegExp]> = [
      [{ collection: "users", operations: [] }, /at least one operation/],
      [{ collection: "users" }, /at least one operation/],
      [{ collection: "users", operations: [{ replaceOne: { filter: { _id: "a" } } }] }, /unknown operation "replaceOne"/],
      [{ collection: "users", operations: [{ insertOne: { document: {} }, deleteOne: { filter: { _id: "a" } } }] }, /one of the keys/],
      [{ collection: "users", operations: [{ deleteOne: { filer: { _id: "a" } } }] }, /unknown field "filer"/],
      [{ collection: "users", operations: [{ deleteOne: {} }] }, /filter is required/],
      [{ collection: "users", operations: [{ deleteOne: { filter: "a" } }] }, /filter must be an object/],
      [{ collection: "users", operations: [{ insertOne: { document: [1] } }] }, /document must be an object/],
      [{ collection: "users", operations: [{ insertOne: 1 }] }, /must be an object/],
      [{ collection: "users", operations: [{ updateOne: { filter: { _id: "a" }, update: 1 } }] }, /update must be an object/],
      [{ collection: "users", operations: [{ updateOne: { filter: { _id: "a" }, update: { $set: {} }, upsert: "yes" } }] }, /upsert must be a boolean/],
      [{ collection: "users", operations: [{ deleteOne: { filter: { _id: "a" } } }], ordered: "no" }, /ordered must be a boolean/],
      [{ collection: "users", operations: [{ deleteOne: { filter: { _id: "a" } } }], query: {} }, /unknown field "query"/],
      ["text", /input must be an object/],
    ];
    for (const [input, message] of refused) {
      await expect(call("documents.bulk", input)).rejects.toThrow(message);
    }
    expect(server.docs("test", "users")).toHaveLength(3);
  });
});

describe("mongo.documents.explain (R44)", () => {
  it("explains a find, without the fields of the cluster time", async () => {
    const result = await call<{ operation: string; plan: Record<string, unknown> }>("documents.explain", {
      collection: "users",
      query: { team: "red" },
      sort: { name: 1 },
      projection: { name: 1 },
      limit: 5,
    });
    expect(result.operation).toBe("find");
    expect(result.plan["queryPlanner"]).toMatchObject({ namespace: "test.users", parsedQuery: { team: "red" }, winningPlan: { stage: "COLLSCAN" } });
    expect(result.plan).not.toHaveProperty("$clusterTime");
    expect(result.plan).not.toHaveProperty("operationTime");
    expect(result.plan).not.toHaveProperty("executionStats");
  });

  it("explains an aggregation, and gives the statistics with executionStats", async () => {
    const result = await call<{ operation: string; plan: Record<string, unknown> }>("documents.explain", {
      collection: "users",
      pipeline: [{ $match: { team: "red" } }, { $group: { _id: "$team" } }],
      verbosity: "executionStats",
    });
    expect(result.operation).toBe("aggregate");
    expect(result.plan["executionStats"]).toMatchObject({ executionSuccess: true });
    const find = await call<{ plan: Record<string, unknown> }>("documents.explain", { collection: "users", verbosity: "allPlansExecution" });
    expect(find.plan["executionStats"]).toMatchObject({ nReturned: 3 });
  });

  it("refuses $out and $merge, also in a nested pipeline, and the fields of a find with a pipeline", async () => {
    const refused: Array<[unknown, RegExp]> = [
      [{ collection: "users", pipeline: [{ $out: "copy" }] }, /read only: the stage \$out/],
      [{ collection: "users", pipeline: [{ $facet: { a: [{ $merge: { into: "copy" } }] } }] }, /read only: the stage \$merge/],
      [{ collection: "users", pipeline: [], query: { a: 1 } }, /not both/],
      [{ collection: "users", pipeline: [1] }, /list of stages/],
      [{ collection: "users", query: [] }, /query must be an object/],
      [{ collection: "users", limit: 0 }, /limit must be an integer/],
      [{ collection: "users", verbosity: "loud" }, /verbosity must be/],
      [{ collection: "users", filter: {} }, /unknown field "filter"/],
      [null, /input must be an object/],
    ];
    for (const [input, message] of refused) {
      await expect(call("documents.explain", input)).rejects.toThrow(message);
    }
    expect(server.databases.get("test")?.has("copy")).toBe(false);
  });
});

describe("mongo.watch (R44)", () => {
  async function watch(input: unknown, options: { signal?: AbortSignal } = {}): Promise<AsyncIterator<WatchChange>> {
    const output = await invokePath<WatchChange>(["mongo", "watch"], input, { registry, ...options });
    return outputItems(output)[Symbol.asyncIterator]();
  }

  it("gives the changes of a collection until the reader stops, and then closes the change stream", async () => {
    const changes = await watch({ collection: "users" });
    const first = changes.next();
    // The change stream opens with the first read: write after it
    await new Promise((resolve) => setTimeout(resolve, 10));
    await call("documents.insert", { collection: "users", documents: { _id: "d", name: "Di" } });
    await call("documents.insert", { collection: "other", documents: { _id: "x" } });
    await call("documents.update", { collection: "users", id: "a", idType: "string", update: { $set: { team: "blue" } } });
    const inserted = (await first).value!;
    expect(inserted).toMatchObject({ operationType: "insert", ns: { db: "test", coll: "users" }, documentKey: { _id: "d" }, fullDocument: { _id: "d", name: "Di" } });
    expect(inserted.resumeToken).toMatch(/^[0-9a-f]+$/);
    expect(typeof inserted.wallTime).toBe("string");
    const updated = (await changes.next()).value!;
    expect(updated).toMatchObject({ operationType: "update", documentKey: { _id: "a" }, updateDescription: { updatedFields: { team: "blue" } } });
    expect(server.listeners.size).toBe(1);
    await changes.return?.(undefined);
    expect(server.listeners.size).toBe(0);
  });

  it("watches a database, filters with $match, and resumes after a token", async () => {
    await call("documents.insert", { collection: "users", documents: { _id: "d" } });
    const token = server.changeLog[0]!.event["_id"]._data as string;
    await call("documents.delete", { collection: "other", filter: { _id: "none" } });
    await call("documents.insert", { collection: "other", documents: { _id: "x" } });
    await call("documents.delete", { collection: "users", id: "b", idType: "string" });
    const changes = await watch({ resumeAfter: token, pipeline: [{ $match: { operationType: { $in: ["insert", "delete"] } } }] });
    expect((await changes.next()).value).toMatchObject({ operationType: "insert", ns: { coll: "other" }, documentKey: { _id: "x" } });
    expect((await changes.next()).value).toMatchObject({ operationType: "delete", ns: { coll: "users" }, documentKey: { _id: "b" } });
    await changes.return?.(undefined);
  });

  it("gives the full document of an update with updateLookup", async () => {
    const changes = await watch({ collection: "users", fullDocument: "updateLookup" });
    const next = changes.next();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await call("documents.update", { collection: "users", id: "c", idType: "string", update: { $set: { team: "blue" } } });
    expect((await next).value).toMatchObject({ operationType: "update", fullDocument: { _id: "c", name: "Cy", team: "blue" } });
    await changes.return?.(undefined);
  });

  it("stops without an error when the signal aborts", async () => {
    const controller = new AbortController();
    const changes = await watch({ collection: "users" }, { signal: controller.signal });
    const next = changes.next();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(server.listeners.size).toBe(1);
    controller.abort();
    await expect(next).rejects.toMatchObject({ code: "ABORTED" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(server.listeners.size).toBe(0);
  });

  it("passes on the refusal of a server without a replica set", async () => {
    server.replicaSet = false;
    const changes = await watch({ collection: "users" });
    await expect(changes.next()).rejects.toThrow(/only supported on replica sets/);
  });

  it("refuses a stage that a change stream does not accept, and an unknown field", async () => {
    const refused: Array<[unknown, RegExp]> = [
      [{ pipeline: [{ $out: "copy" }] }, /pipeline\[0\] must be one stage of/],
      [{ pipeline: [{ $group: { _id: 1 } }] }, /pipeline\[0\] must be one stage of/],
      [{ pipeline: {} }, /pipeline must be a list/],
      [{ fullDocument: "all" }, /fullDocument must be/],
      [{ resumeAfter: "" }, /resumeAfter must be/],
      [{ filter: {} }, /unknown field "filter"/],
      [[], /input must be an object/],
    ];
    for (const [input, message] of refused) {
      await expect(watch(input).then((changes) => changes.next())).rejects.toThrow(message);
    }
  });

  it("makes an item of each kind of event of the driver", () => {
    expect(toWatchChange({ _id: { other: 1 }, operationType: "dropDatabase", ns: { db: "test" } })).toEqual({
      operationType: "dropDatabase",
      ns: { db: "test" },
      resumeToken: '{"other":1}',
    });
    expect(toWatchChange({ operationType: "delete", fullDocument: null })).toEqual({ operationType: "delete", fullDocument: null, resumeToken: "null" });
  });
});
