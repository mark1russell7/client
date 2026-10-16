/**
 * The procedures against a real MongoDB server (roadmap R32). The nightly workflow starts a
 * MongoDB service container and sets `LIVE_MONGO=1` and `MONGODB_URI`. Without them, the tests do
 * not start: the other tests use the fake of the driver.
 */

import { afterAll, describe, expect, it } from "vitest";
import { Client, LocalTransport, PROCEDURE_REGISTRY } from "@procedures/client";
import "./register.js";
import { getDefaultConnection, hasDefaultConnection } from "./connection.js";
import { MongoStorage } from "./storage/mongo-storage.js";

const live = process.env["LIVE_MONGO"] === "1";
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
});
