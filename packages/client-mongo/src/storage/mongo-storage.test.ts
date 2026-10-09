/**
 * MongoStorage gets its collection for each operation (deep dive DATA-6). Before, it kept the
 * collection of the first connection, and each operation failed after a reconnect.
 */

import { afterEach, describe, expect, it } from "vitest";
import { disconnect, setDefaultConnection } from "../connection.js";
import { MongoStorage } from "./mongo-storage.js";
import { FakeServer, fakeConnection } from "../../test/fake-mongo.js";

afterEach(async () => {
  await disconnect();
});

describe("MongoStorage", () => {
  it("works after the default connection is replaced", async () => {
    const server = new FakeServer();
    const first = fakeConnection(server);
    setDefaultConnection(first);

    const storage = new MongoStorage<{ n: number }>({ collection: "items" });
    await storage.set("a", { n: 1 });

    // What connect() does: a new default connection, then the old one closes
    setDefaultConnection(fakeConnection(server));
    await first.disconnect();

    expect(await storage.get("a")).toEqual({ n: 1 });
    await storage.set("b", { n: 2 });
    expect(await storage.size()).toBe(2);
  });

  it("stores, reads and deletes items", async () => {
    setDefaultConnection(fakeConnection(new FakeServer()));
    const storage = new MongoStorage<string>({ collection: "items" });
    await storage.setBatch([
      ["a", "x"],
      ["b", "y"],
    ]);
    expect(await storage.has("a")).toBe(true);
    expect([...(await storage.getBatch(["a", "b"])).entries()]).toEqual([
      ["a", "x"],
      ["b", "y"],
    ]);
    expect(await storage.delete("a")).toBe(true);
    expect(await storage.getAll()).toEqual(["y"]);
  });
});
