/**
 * The document procedures against an in-memory fake of the driver.
 *
 * - DATA-4: delete and update need exactly one target (`id` or a filter), and reject unknown fields.
 * - DATA-5: the collection and the database come from the input (metadata stays a fallback).
 * - DATA-15: an upsert by a 24-hex id updates one document, and does not insert a new one each time.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { Client, LocalTransport, PROCEDURE_REGISTRY } from "@mark1russell7/client";
import "../register.js";
import { setDefaultConnection } from "../connection.js";
import { FakeServer, fakeConnection } from "../../test/fake-mongo.js";

const client = new Client(new LocalTransport({ registry: PROCEDURE_REGISTRY }));

function call<T = Record<string, unknown>>(
  operation: string,
  input: unknown,
  metadata?: Record<string, unknown>,
): Promise<T> {
  const parts = operation.split(".");
  return client.call<unknown, T>(
    { service: ["mongo", ...parts.slice(0, -1)].join("."), operation: parts[parts.length - 1]! },
    input,
    metadata,
  );
}

let server: FakeServer;

beforeEach(async () => {
  server = new FakeServer();
  setDefaultConnection(fakeConnection(server));
  const docs = server.docs("test", "users");
  docs.push({ _id: "a", name: "Ann" }, { _id: "b", name: "Bob" }, { _id: "c", name: "Cy" });
});

describe("mongo.documents.delete (DATA-4)", () => {
  it("rejects the find field name 'query', which matched every document before", async () => {
    await expect(call("documents.delete", { collection: "users", query: { name: "Ann" }, multi: true })).rejects.toThrow(
      /unknown field "query"/,
    );
    expect(server.docs("test", "users")).toHaveLength(3);
  });

  it("rejects a call with no id and no filter", async () => {
    await expect(call("documents.delete", { collection: "users", multi: true })).rejects.toThrow(/id or filter/);
    expect(server.docs("test", "users")).toHaveLength(3);
  });

  it("rejects a call with both an id and a filter", async () => {
    await expect(call("documents.delete", { collection: "users", id: "a", filter: { name: "Bob" } })).rejects.toThrow(
      /id or filter/,
    );
  });

  it("rejects an empty id", async () => {
    await expect(call("documents.delete", { collection: "users", id: "" })).rejects.toThrow(/non-empty/);
  });

  it("needs confirm: true for an empty filter", async () => {
    await expect(call("documents.delete", { collection: "users", filter: {}, multi: true })).rejects.toThrow(/confirm/);
    expect(server.docs("test", "users")).toHaveLength(3);

    const result = await call("documents.delete", { collection: "users", filter: {}, multi: true, confirm: true });
    expect(result["deletedCount"]).toBe(3);
  });

  it("deletes by id and by filter", async () => {
    expect((await call("documents.delete", { collection: "users", id: "a" }))["deletedCount"]).toBe(1);
    expect((await call("documents.delete", { collection: "users", filter: { name: "Bob" } }))["deletedCount"]).toBe(1);
    expect(server.docs("test", "users").map((d) => d["_id"])).toEqual(["c"]);
  });
});

describe("mongo.documents.update (DATA-4)", () => {
  it("rejects 'query' and a call with no target", async () => {
    await expect(
      call("documents.update", { collection: "users", query: { name: "Ann" }, update: { $set: { x: 1 } }, multi: true }),
    ).rejects.toThrow(/unknown field "query"/);
    await expect(call("documents.update", { collection: "users", update: { $set: { x: 1 } }, multi: true })).rejects.toThrow(
      /id or filter/,
    );
    expect(server.docs("test", "users").some((d) => "x" in d)).toBe(false);
  });

  it("needs confirm: true for an empty filter", async () => {
    await expect(
      call("documents.update", { collection: "users", filter: {}, update: { $set: { x: 1 } }, multi: true }),
    ).rejects.toThrow(/confirm/);
    const result = await call("documents.update", {
      collection: "users",
      filter: {},
      update: { $set: { x: 1 } },
      multi: true,
      confirm: true,
    });
    expect(result["modifiedCount"]).toBe(3);
  });

  it("requires an update", async () => {
    await expect(call("documents.update", { collection: "users", id: "a" })).rejects.toThrow(/update/);
  });
});

describe("mongo.documents.update upsert by id (DATA-15)", () => {
  it("inserts one document, then updates it", async () => {
    const id = new ObjectId().toHexString();
    await call("documents.update", { collection: "users", id, update: { $set: { n: 1 } }, upsert: true });
    await call("documents.update", { collection: "users", id, update: { $set: { n: 2 } }, upsert: true });

    const created = server.docs("test", "users").filter((d) => d["n"] !== undefined);
    expect(created).toHaveLength(1);
    expect(created[0]!["n"]).toBe(2);
    expect(String(created[0]!["_id"])).toBe(id);
  });

  it("updates an existing document with a 24-hex string _id", async () => {
    const id = "0123456789abcdef01234567";
    server.docs("test", "users").push({ _id: id, n: 0 });
    await call("documents.update", { collection: "users", id, update: { $set: { n: 5 } }, upsert: true });
    const matching = server.docs("test", "users").filter((d) => String(d["_id"]) === id);
    expect(matching).toHaveLength(1);
    expect(matching[0]!["n"]).toBe(5);
  });
});

describe("collection and database as input fields (DATA-5)", () => {
  it("reads the collection from the input", async () => {
    const result = await call<{ count: number }>("documents.count", { collection: "users" });
    expect(result.count).toBe(3);
  });

  it("keeps metadata as a fallback", async () => {
    const result = await call<{ count: number }>("documents.count", {}, { collection: "users" });
    expect(result.count).toBe(3);
  });

  it("reads the database from the input", async () => {
    server.docs("other", "users").push({ _id: "z" });
    const result = await call<{ count: number }>("documents.count", { collection: "users", database: "other" });
    expect(result.count).toBe(1);
  });

  it("finds and gets with the collection in the input", async () => {
    const found = await call<{ documents: unknown[] }>("documents.find", { collection: "users", query: { name: "Bob" } });
    expect(found.documents).toEqual([{ _id: "b", name: "Bob" }]);
    const got = await call<{ document: unknown }>("documents.get", { collection: "users", id: "c", idType: "string" });
    expect(got.document).toEqual({ _id: "c", name: "Cy" });
  });

  it("inserts with the collection in the input", async () => {
    await call("documents.insert", { collection: "people", documents: [{ name: "Di" }] });
    expect(server.docs("test", "people")).toHaveLength(1);
  });

  it("names the missing collection", async () => {
    await expect(call("documents.count", {})).rejects.toThrow(/collection/);
  });
});
