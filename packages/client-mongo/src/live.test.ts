/**
 * The procedures against a real MongoDB server (roadmap R32). The nightly workflow starts a
 * MongoDB service container and sets `LIVE_MONGO=1` and `MONGODB_URI`. Without them, the tests do
 * not start: the other tests use the fake of the driver. The test of `mongo.watch` also needs
 * `LIVE_MONGO_REPLICA=1`: a change stream needs a replica set, and the nightly server is standalone.
 */

import { afterAll, describe, expect, it } from "vitest";
import { Client, LocalTransport, PROCEDURE_REGISTRY, invokePath, outputItems } from "@procedures/client";
import "./register.js";
import { getDefaultConnection, hasDefaultConnection } from "./connection.js";
import { MongoStorage } from "./storage/mongo-storage.js";

const live = process.env["LIVE_MONGO"] === "1";
/** The server at MONGODB_URI is a replica set: mongo.watch needs one (roadmap R44). */
const liveReplica = process.env["LIVE_MONGO_REPLICA"] === "1";
const client = new Client(new LocalTransport({ registry: PROCEDURE_REGISTRY }));
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const collection = `live_${suffix}`;

function call<T = Record<string, unknown>>(operation: string, input: unknown): Promise<T> {
  const parts = operation.split(".");
  return client.call<unknown, T>({ service: ["mongo", ...parts.slice(0, -1)].join("."), operation: parts[parts.length - 1]! }, input);
}

describe.runIf(live)("mongo.* against a real server (R32)", () => {
  afterAll(async () => {
    await call("collections.drop", { collection, confirm: true }).catch(() => undefined);
    await call("collections.drop", { collection: `${collection}_storage`, confirm: true }).catch(() => undefined);
    if (hasDefaultConnection()) await getDefaultConnection().disconnect();
  });

  it("pings the server", async () => {
    expect(await call<{ ok: boolean }>("database.ping", {})).toMatchObject({ ok: true });
  });

  it("inserts, finds, counts, updates and deletes documents", async () => {
    const inserted = await call<{ insertedCount: number }>("documents.insert", {
      collection,
      documents: [
        { _id: "a", name: "Ann", team: "red", score: 3 },
        { _id: "b", name: "Bob", team: "blue", score: 5 },
        { _id: "c", name: "Cy", team: "red", score: 8 },
      ],
    });
    expect(inserted.insertedCount).toBe(3);
    const found = await call<{ documents: Array<{ name: string }> }>("documents.find", { collection, query: { team: "red" }, sort: { score: 1 } });
    expect(found.documents.map((document) => document.name)).toEqual(["Ann", "Cy"]);
    expect(await call<{ count: number }>("documents.count", { collection, query: { team: "red" } })).toMatchObject({ count: 2 });

    const updated = await call<{ matchedCount: number }>("documents.update", { collection, id: "b", update: { $set: { team: "red" } } });
    expect(updated.matchedCount).toBe(1);
    expect(await call<{ count: number }>("documents.count", { collection, query: { team: "red" } })).toMatchObject({ count: 3 });

    await call("documents.delete", { collection, id: "a" });
    expect(await call<{ count: number }>("documents.count", { collection })).toMatchObject({ count: 2 });
  });

  it("aggregates, and refuses a stage that writes", async () => {
    const result = await call<{ results: Array<{ _id: string; total: number }> }>("documents.aggregate", {
      collection,
      pipeline: [{ $group: { _id: "$team", total: { $sum: "$score" } } }, { $sort: { _id: 1 } }],
    });
    expect(result.results).toEqual([{ _id: "red", total: 13 }]);
    await expect(call("documents.aggregate", { collection, pipeline: [{ $out: `${collection}_copy` }] })).rejects.toThrow();
  });

  it("gives the distinct values of a field (R44)", async () => {
    const result = await call<{ values: string[] }>("documents.distinct", { collection, field: "team" });
    expect(result.values.sort()).toEqual(["red"]);
  });

  it("runs a bulk write in order, and refuses an empty filter without confirm (R44)", async () => {
    const result = await call<Record<string, unknown>>("documents.bulk", {
      collection,
      operations: [
        { insertOne: { document: { _id: "e", name: "Ed", team: "green", score: 1 } } },
        { updateOne: { filter: { _id: "e" }, update: { $inc: { score: 1 } } } },
        { updateMany: { filter: { team: "green" }, update: { $set: { checked: true } } } },
        { updateOne: { filter: { _id: "f" }, update: { $set: { name: "Fay", team: "green" } }, upsert: true } },
        { deleteOne: { filter: { _id: "f" } } },
      ],
    });
    expect(result).toMatchObject({ ok: true, insertedCount: 1, matchedCount: 2, modifiedCount: 2, upsertedCount: 1, deletedCount: 1, insertedIds: { "0": "e" }, upsertedIds: { "3": "f" } });
    await expect(call("documents.bulk", { collection, operations: [{ deleteMany: { filter: {} } }] })).rejects.toThrow(/confirm/);
    await call("documents.bulk", { collection, operations: [{ deleteMany: { filter: { team: "green" } } }] });
    expect(await call<{ count: number }>("documents.count", { collection })).toMatchObject({ count: 2 });
  });

  it("explains a find and an aggregation, and refuses $out (R44)", async () => {
    const find = await call<{ operation: string; plan: Record<string, unknown> }>("documents.explain", { collection, query: { team: "red" }, verbosity: "executionStats" });
    expect(find.operation).toBe("find");
    expect(find.plan).toHaveProperty("queryPlanner");
    expect(find.plan).toHaveProperty("executionStats");
    const aggregate = await call<{ operation: string; plan: Record<string, unknown> }>("documents.explain", { collection, pipeline: [{ $match: { team: "red" } }] });
    expect(aggregate.operation).toBe("aggregate");
    await expect(call("documents.explain", { collection, pipeline: [{ $out: `${collection}_copy` }] })).rejects.toThrow(/read only/);
  });

  it("makes, lists and drops an index", async () => {
    const made = await call<{ indexName: string }>("indexes.create", { collection, keys: { name: 1 }, options: { name: "by_name", unique: true } });
    expect(made.indexName).toBe("by_name");
    const listed = await call<{ indexes: Array<{ name: string }> }>("indexes.list", { collection });
    expect(listed.indexes.map((index) => index.name)).toContain("by_name");
    // The unique index refuses a second document with the same name
    await expect(call("documents.insert", { collection, documents: { _id: "d", name: "Bob" } })).rejects.toThrow();
    await call("indexes.drop", { collection, indexName: "by_name" });
  });

  it("stores the items of a collection storage", async () => {
    const storage = new MongoStorage<{ title: string }>({ collection: `${collection}_storage` });
    await storage.set("one", { title: "first" });
    await storage.set("two", { title: "second" });
    expect(await storage.get("one")).toEqual({ title: "first" });
    expect(await storage.size()).toBe(2);
    await storage.delete("one");
    expect(await storage.has("one")).toBe(false);
  });

  // A change stream needs a replica set. The service container of the nightly workflow is a
  // standalone server, so this test runs only with LIVE_MONGO_REPLICA=1 (a replica set at MONGODB_URI).
  it.runIf(liveReplica)("gives the changes of a collection, and stops with the reader (R44)", async () => {
    const output = await invokePath<{ operationType: string; documentKey: { _id: string } }>(["mongo", "watch"], { collection }, { registry: PROCEDURE_REGISTRY });
    const changes = outputItems(output)[Symbol.asyncIterator]();
    const first = changes.next();
    // The change stream opens with the first read: write after it
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await call("documents.insert", { collection, documents: { _id: "w", name: "Wes" } });
    const change = await first;
    expect(change.value).toMatchObject({ operationType: "insert", documentKey: { _id: "w" } });
    await changes.return?.(undefined);
    await call("documents.delete", { collection, id: "w", idType: "string" });
  }, 30_000);
});
