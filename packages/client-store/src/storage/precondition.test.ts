/**
 * The preconditions of the writes in `@procedures/store` (roadmap CLI-16): `ApiStorage` sends the
 * expected versions to the collection procedures, and `HybridStorage` sends the base version of
 * each queued write. A `VERSION_CONFLICT` of the remote goes to the conflict policy.
 */

import { describe, it, expect } from "vitest";
import { InMemoryStorage, VersionConflictError, type CollectionStorage, type StorageItemWriteOptions } from "@procedures/collections";
import { Client, LocalTransport, createCollectionProcedures, invokeProcedure, ms, outputValue, type RepositoryProvider } from "@procedures/client";
import { ApiStorage } from "./api.js";
import { ConflictError, HybridStorage, type HybridStorageOptions } from "./hybrid.js";

type Item = { id: string; n: number; rev: string };

const versionOf = (item: Item): string | undefined => item.rev;
const item = (id: string, n: number, rev: string): Item => ({ id, n, rev });

/** An ApiStorage over the core collection procedures, on a server storage with `versionOf`. */
function apiOver(storage: CollectionStorage<Item>, options: { service?: string } = {}): ApiStorage<Item> {
  const repository = { getStorage: () => storage, hasCollection: () => true } as unknown as RepositoryProvider;
  const handlers: Record<string, (payload: unknown) => Promise<unknown>> = {};
  for (const procedure of createCollectionProcedures("items")) {
    handlers[procedure.path.join(".")] = async (payload) => outputValue(await invokeProcedure(procedure, payload, { repository }), procedure.path);
  }
  const client = new Client({ transport: new LocalTransport({ handlers }) });
  return new ApiStorage<Item>(client, options.service ? { service: options.service, retry: false } : { collection: "items", retry: false });
}

/**
 * A HybridStorage in `write-back` mode over a remote with versions. It synced "a" at rev 1, and
 * then another writer changed the remote item to rev 2. The local write of "a" at rev L waits in
 * the queue with the base version 1.
 */
async function staleQueuedWrite(options: HybridStorageOptions = {}): Promise<{ server: InMemoryStorage<Item>; hybrid: HybridStorage<Item> }> {
  const server = new InMemoryStorage<Item>({ versionOf });
  await server.set("a", item("a", 1, "1"));
  const hybrid = new HybridStorage<Item>(apiOver(server), { mode: "write-back", syncOnInit: false, syncInterval: ms(0), versionOf, ...options });
  await hybrid.syncFromRemote();
  await hybrid.set("a", item("a", 5, "L"));
  await server.set("a", item("a", 9, "2"));
  return { server, hybrid };
}

describe("ApiStorage sends the preconditions (CLI-16)", () => {
  it("sends expectedVersion of set and delete, and the expected version of each item of setBatch", async () => {
    const server = new InMemoryStorage<Item>({ versionOf });
    const api = apiOver(server);
    await api.set("a", item("a", 1, "1"), { expectedVersion: null });
    await api.set("a", item("a", 2, "2"), { expectedVersion: "1" });
    expect(await server.get("a")).toEqual(item("a", 2, "2"));
    await api.setBatch([["a", item("a", 3, "3")], ["b", item("b", 1, "1")]], { expectedVersions: [["a", "2"], ["b", null]] });
    expect(await server.getBatch(["a", "b"])).toEqual(new Map([["a", item("a", 3, "3")], ["b", item("b", 1, "1")]]));
    expect(await api.delete("b", { expectedVersion: "1" })).toBe(true);
  });

  it("rejects a conflict with VersionConflictError and the current item from the wire", async () => {
    const server = new InMemoryStorage<Item>({ versionOf });
    await server.set("a", item("a", 1, "1"));
    const api = apiOver(server);
    const error = await api.set("a", item("a", 2, "2"), { expectedVersion: "0" }).catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(VersionConflictError);
    expect((error as VersionConflictError).conflicts).toEqual([{ id: "a", expected: "0", found: true, value: item("a", 1, "1"), version: "1" }]);
    expect(await server.get("a")).toEqual(item("a", 1, "1"));
  });

  it("refuses a precondition for a custom service and for an id that the batch does not write", async () => {
    const custom = apiOver(new InMemoryStorage<Item>({ versionOf }), { service: "custom.items" });
    await expect(custom.set("a", item("a", 1, "1"), { expectedVersion: null })).rejects.toMatchObject({ code: "PRECONDITION_NOT_SUPPORTED" });
    const api = apiOver(new InMemoryStorage<Item>({ versionOf }));
    await expect(api.setBatch([["a", item("a", 1, "1")]], { expectedVersions: [["b", null]] })).rejects.toBeInstanceOf(TypeError);
  });

  it("a server storage without versionOf refuses the precondition, and changes nothing", async () => {
    const server = new InMemoryStorage<Item>();
    await server.set("a", item("a", 1, "1"));
    const api = apiOver(server);
    await expect(api.set("a", item("a", 2, "2"), { expectedVersion: "1" })).rejects.toMatchObject({ code: "PRECONDITION_NOT_SUPPORTED" });
    expect(await server.get("a")).toEqual(item("a", 1, "1"));
  });
});

describe("HybridStorage sends the base version of a queued write (CLI-16)", () => {
  it("a push without a change of another writer writes, and the next queued write expects the new version", async () => {
    const server = new InMemoryStorage<Item>({ versionOf });
    await server.set("a", item("a", 1, "1"));
    const hybrid = new HybridStorage<Item>(apiOver(server), { mode: "write-back", syncOnInit: false, syncInterval: ms(0), versionOf });
    await hybrid.syncFromRemote();
    await hybrid.set("a", item("a", 2, "2"));
    await hybrid.syncToRemote();
    await hybrid.set("a", item("a", 3, "3"));
    await hybrid.syncToRemote();
    expect(await server.get("a")).toEqual(item("a", 3, "3"));
    expect(hybrid.getPendingOpsCount()).toBe(0);
    await hybrid.close();
  });

  it("remote: the remote item replaces the queued write", async () => {
    const { server, hybrid } = await staleQueuedWrite({ conflictResolution: "remote" });
    await hybrid.syncToRemote();
    expect(await server.get("a")).toEqual(item("a", 9, "2"));
    expect(await hybrid.get("a")).toEqual(item("a", 9, "2"));
    expect(hybrid.getPendingOpsCount()).toBe(0);
    expect((await hybrid.getMetadata()).stats?.["conflicts"]).toBe(1);
    await hybrid.close();
  });

  it("local: the queued write replaces the remote item, with the current version as its base", async () => {
    const { server, hybrid } = await staleQueuedWrite({ conflictResolution: "local" });
    await hybrid.syncToRemote();
    expect(await server.get("a")).toEqual(item("a", 5, "L"));
    expect(hybrid.getPendingOpsCount()).toBe(0);
    await hybrid.close();
  });

  it("merge: the merged item goes to the remote", async () => {
    const mergeFn = <T>(local: T, remote: T): T => ({ ...(remote as object), n: (local as unknown as Item).n + (remote as unknown as Item).n, rev: "M" }) as T;
    const { server, hybrid } = await staleQueuedWrite({ conflictResolution: "merge", mergeFn });
    await hybrid.syncToRemote();
    expect(await server.get("a")).toEqual(item("a", 14, "M"));
    expect(await hybrid.get("a")).toEqual(item("a", 14, "M"));
    expect(hybrid.getPendingOpsCount()).toBe(0);
    await hybrid.close();
  });

  it("error: the push throws ConflictError, and the queue and the remote keep their items", async () => {
    const { server, hybrid } = await staleQueuedWrite({ conflictResolution: "error" });
    const error = await hybrid.syncToRemote().catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).ids).toEqual(["a"]);
    expect(await server.get("a")).toEqual(item("a", 9, "2"));
    expect(await hybrid.get("a")).toEqual(item("a", 5, "L"));
    expect(hybrid.getPendingOpsCount()).toBe(1);
    await hybrid.close().catch(() => undefined);
  });

  it("sendBaseVersions: false sends no precondition: the queued write replaces the remote item, as before", async () => {
    const { server, hybrid } = await staleQueuedWrite({ conflictResolution: "remote", sendBaseVersions: false });
    await hybrid.syncToRemote();
    expect(await server.get("a")).toEqual(item("a", 5, "L"));
    expect((await hybrid.getMetadata()).stats?.["conflicts"]).toBe(0);
    await hybrid.close();
  });

  it("a delete of another writer: remote deletes the local item, local writes the item again", async () => {
    for (const conflictResolution of ["remote", "local"] as const) {
      const server = new InMemoryStorage<Item>({ versionOf });
      await server.set("a", item("a", 1, "1"));
      const hybrid = new HybridStorage<Item>(apiOver(server), { mode: "write-back", syncOnInit: false, syncInterval: ms(0), versionOf, conflictResolution });
      await hybrid.syncFromRemote();
      await hybrid.set("a", item("a", 5, "L"));
      await server.delete("a");
      await hybrid.syncToRemote();
      if (conflictResolution === "remote") {
        expect(await hybrid.get("a")).toBeUndefined();
        expect(await server.get("a")).toBeUndefined();
      } else {
        expect(await server.get("a")).toEqual(item("a", 5, "L"));
      }
      expect(hybrid.getPendingOpsCount()).toBe(0);
      await hybrid.close();
    }
  });

  it("the echo of a send whose answer was lost is not a conflict", async () => {
    const server = new InMemoryStorage<Item>({ versionOf });
    await server.set("a", item("a", 1, "1"));
    // The first send reaches the server, and its answer is lost
    let lose = true;
    const api = apiOver(server);
    const remote: CollectionStorage<Item> = Object.assign(Object.create(api) as ApiStorage<Item>, {
      set: async (id: string, value: Item, options?: StorageItemWriteOptions) => {
        await api.set(id, value, options);
        if (lose) {
          lose = false;
          throw Object.assign(new Error("the answer was lost"), { retryable: true });
        }
      },
    });
    const hybrid = new HybridStorage<Item>(remote, { mode: "write-back", syncOnInit: false, syncInterval: ms(0), versionOf, conflictResolution: "error" });
    await hybrid.syncFromRemote();
    await hybrid.set("a", item("a", 2, "2"));
    await expect(hybrid.syncToRemote()).rejects.toThrow(/lost/);
    expect(hybrid.getPendingOpsCount()).toBe(1);
    await hybrid.syncToRemote();
    expect(hybrid.getPendingOpsCount()).toBe(0);
    expect(await server.get("a")).toEqual(item("a", 2, "2"));
    expect((await hybrid.getMetadata()).stats?.["conflicts"]).toBe(0);
    await hybrid.close();
  });

  it("a caller precondition: the local copy tests it, and the remote tests it in write-through mode", async () => {
    const server = new InMemoryStorage<Item>({ versionOf });
    await server.set("a", item("a", 1, "1"));
    const hybrid = new HybridStorage<Item>(apiOver(server), { mode: "write-through", syncOnInit: false, syncInterval: ms(0), versionOf });
    await hybrid.syncFromRemote();
    await expect(hybrid.set("a", item("a", 2, "2"), { expectedVersion: "0" })).rejects.toBeInstanceOf(VersionConflictError);
    // Another writer changes the remote item: the local copy passes, the remote refuses, and the local change is undone
    await server.set("a", item("a", 7, "7"));
    await expect(hybrid.set("a", item("a", 2, "2"), { expectedVersion: "1" })).rejects.toBeInstanceOf(VersionConflictError);
    expect(await hybrid.get("a")).toEqual(item("a", 1, "1"));
    expect(await server.get("a")).toEqual(item("a", 7, "7"));
    await hybrid.close();
  });
});
