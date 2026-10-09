/**
 * The procedures connect on the first call (deep dive DATA-5). Before, nothing called
 * `connect()`, so each `mongo.*` tool of the MCP server failed with "not initialized".
 */

import { afterEach, describe, expect, it } from "vitest";
import { configure, disconnect, ensureConnection, hasDefaultConnection, setDefaultConnection } from "./connection.js";
import { FakeServer, fakeConnection } from "../test/fake-mongo.js";

afterEach(async () => {
  configure({});
  await disconnect();
});

describe("ensureConnection", () => {
  it("returns the default connection when it is open", async () => {
    const connection = fakeConnection(new FakeServer());
    setDefaultConnection(connection);
    expect(await ensureConnection()).toBe(connection);
  });

  it("connects with the configured URI when there is no connection", async () => {
    // Nothing listens on port 1: the error comes from the connection attempt
    configure({ uri: "mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=200&connectTimeoutMS=200" });
    expect(hasDefaultConnection()).toBe(false);
    const error = await ensureConnection().then(
      () => undefined,
      (e: unknown) => e as Error,
    );
    expect(error).toBeInstanceOf(Error);
    expect(error!.message).not.toMatch(/not initialized/);
  });

  it("starts one connection attempt for concurrent first calls", async () => {
    configure({ uri: "mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=200&connectTimeoutMS=200" });
    const first = ensureConnection();
    const second = ensureConnection();
    expect(second).toBe(first);
    await first.catch(() => undefined);
  });

  it("connects again after the connection closes", async () => {
    const closed = fakeConnection(new FakeServer());
    setDefaultConnection(closed);
    await closed.disconnect();
    configure({ uri: "mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=200&connectTimeoutMS=200" });
    await expect(ensureConnection()).rejects.toThrow();
  });
});
