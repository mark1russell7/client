/**
 * Each mongo procedure has a real output schema (roadmap 2.1), and the results of the handlers
 * pass it. The calls go through the client, so `invokeProcedure` validates each result against
 * the output schema: a schema that does not match the handler makes the call fail.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { Client, LocalTransport, PROCEDURE_REGISTRY, jsonSchemaOf } from "@mark1russell7/client";
import { procedures } from "../register.js";
import { setDefaultConnection } from "../connection.js";
import { FakeServer, fakeConnection } from "../../test/fake-mongo.js";

const client = new Client(new LocalTransport({ registry: PROCEDURE_REGISTRY }));

function call<T = Record<string, unknown>>(operation: string, input: unknown): Promise<T> {
  const parts = operation.split(".");
  return client.call<unknown, T>({ service: ["mongo", ...parts.slice(0, -1)].join("."), operation: parts[parts.length - 1]! }, input);
}

let server: FakeServer;

beforeEach(() => {
  server = new FakeServer();
  setDefaultConnection(fakeConnection(server));
  server.docs("test", "users").push({ _id: "a", name: "Ann", age: 30 }, { _id: "b", name: "Bob", age: 40 });
});

describe("the output schemas of the mongo procedures", () => {
  for (const procedure of procedures) {
    const key = procedure.path.join(".");
    it(`${key}: an object schema with a description for each field`, () => {
      const json = jsonSchemaOf(procedure.output, { io: "output" });
      expect(json?.["type"], `${key} has no object output schema`).toBe("object");
      const properties = (json?.["properties"] ?? {}) as Record<string, { description?: string }>;
      const missing = Object.entries(properties).filter(([, p]) => !p.description).map(([name]) => name);
      expect(missing, `${key}: fields without a description`).toEqual([]);
    });
  }
});

describe("the results of the mongo procedures pass their output schemas", () => {
  it("database.ping and database.info", async () => {
    expect(await call("database.ping", {})).toMatchObject({ ok: true });
    expect(await call("database.info", {})).toMatchObject({ name: "test", collections: 1, views: 0, empty: false });
  });

  it("collections.create, list, stats and drop", async () => {
    expect(await call("collections.create", { name: "events" })).toEqual({ acknowledged: true, collectionName: "events" });
    expect(await call<{ collections: string[] }>("collections.list", {})).toEqual({ collections: ["events", "users"] });
    expect(await call("collections.stats", { collection: "users" })).toMatchObject({ count: 2, nindexes: 1 });
    expect(await call("collections.drop", { collection: "events", confirm: true })).toEqual({ acknowledged: true, dropped: true });
  });

  it("documents.find, get, count, insert, update, delete and aggregate", async () => {
    const found = await call<{ documents: unknown[]; pagination: { total: number } }>("documents.find", { collection: "users" });
    expect(found.documents).toHaveLength(2);
    expect(found.pagination.total).toBe(2);
    expect(await call("documents.get", { collection: "users", id: "a", idType: "string" })).toMatchObject({ document: { name: "Ann" } });
    expect(await call("documents.get", { collection: "users", id: "zzz", idType: "string" })).toEqual({ document: null });
    expect(await call("documents.count", { collection: "users" })).toEqual({ count: 2 });
    expect(await call("documents.insert", { collection: "users", documents: [{ name: "Cy" }, { name: "Di" }] })).toMatchObject({
      acknowledged: true,
      insertedCount: 2,
    });
    expect(await call("documents.update", { collection: "users", id: "a", idType: "string", update: { $set: { age: 31 } } })).toMatchObject({
      matchedCount: 1,
      upsertedId: null,
    });
    expect(await call("documents.delete", { collection: "users", id: "b", idType: "string" })).toMatchObject({ deletedCount: 1 });
    expect(await call<{ results: unknown[] }>("documents.aggregate", { collection: "users", pipeline: [] })).toMatchObject({
      results: expect.any(Array),
    });
  });

  it("indexes.create, list and drop, also with a kind that is not 1 or -1", async () => {
    expect(await call("indexes.create", { collection: "users", keys: { name: 1 }, options: { unique: true } })).toEqual({
      acknowledged: true,
      indexName: "name_1",
    });
    server.indexesOf("test", "users").push({ v: 2, key: { tag: "hashed" }, name: "tag_hashed" });
    const listed = await call<{ indexes: Array<{ name: string; key: Record<string, unknown> }> }>("indexes.list", { collection: "users" });
    expect(listed.indexes.map((index) => index.name)).toEqual(["_id_", "name_1", "tag_hashed"]);
    expect(await call("indexes.drop", { collection: "users", indexName: "name_1" })).toEqual({ acknowledged: true });
  });
});
