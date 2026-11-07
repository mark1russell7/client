/**
 * The hook `onDropped` of `HybridStorage` (roadmap CLI-106): each path that drops a queued write
 * gives the value and the id to the hook, and the queue goes on.
 */

import { describe, expect, it } from "vitest";
import { InMemoryStorage, type CollectionStorage } from "@procedures/collections";
import { Client, LocalTransport, createCollectionProcedures, invokeProcedure, ms, outputValue, type RepositoryProvider } from "@procedures/client";
import { ApiStorage } from "./api.js";
import { HybridStorage, type DroppedWrite, type HybridStorageOptions } from "./hybrid.js";

type Item = { id: string; n: number; rev: string };

const versionOf = (item: Item): string | undefined => item.rev;
const item = (id: string, n: number, rev: string): Item => ({ id, n, rev });

/** An ApiStorage over the core collection procedures, on a server storage with `versionOf`. */
function apiOver(storage: CollectionStorage<Item>): ApiStorage<Item> {
  const repository = { getStorage: () => storage, hasCollection: () => true } as unknown as RepositoryProvider;
  const handlers: Record<string, (payload: unknown) => Promise<unknown>> = {};
  for (const procedure of createCollectionProcedures("items")) {
    handlers[procedure.path.join(".")] = async (payload) => outputValue(await invokeProcedure(procedure, payload, { repository }), procedure.path);
  }
  const client = new Client({ transport: new LocalTransport({ handlers }) });
  return new ApiStorage<Item>(client, { collection: "items", retry: false });
}

/** A storage over a server that synced "a" at rev 1. The local write of "a" at rev L waits in the queue. */
async function queuedWrite(options: HybridStorageOptions = {}): Promise<{ server: InMemoryStorage<Item>; hybrid: HybridStorage<Item>; drops: DroppedWrite[] }> {
  const server = new InMemoryStorage<Item>({ versionOf });
  await server.set("a", item("a", 1, "1"));
  const drops: DroppedWrite[] = [];
  const hybrid = new HybridStorage<Item>(apiOver(server), {
    mode: "write-back",
    syncOnInit: false,
    syncInterval: ms(0),
    versionOf,
    onDropped: (drop) => {
      drops.push(drop);
    },
    ...options,
  });
  await hybrid.syncFromRemote();
  await hybrid.set("a", item("a", 5, "L"));
  return { server, hybrid, drops };
}

const forbidden = (): Error => Object.assign(new Error("not allowed"), { code: "FORBIDDEN" });

/** A remote that refuses each write of the ids in `refused`, and each clear when `refused` has `"*"`. */
class PickyRemote extends InMemoryStorage<Item> {
  readonly refused = new Set<string>();
  private guard(ids: readonly string[]): void {
    if (ids.some((id) => this.refused.has(id))) throw forbidden();
  }
  override async set(id: string, value: Item) {
    this.guard([id]);
    return super.set(id, value);
  }
  override async delete(id: string) {
    this.guard([id]);
    return super.delete(id);
  }
  override async setBatch(items: Array<[string, Item]>) {
    this.guard(items.map(([id]) => id));
    return super.setBatch(items);
  }
  override async deleteBatch(ids: string[]) {
    this.guard(ids);
    return super.deleteBatch(ids);
  }
  override async clear() {
    this.guard(["*"]);
    return super.clear();
  }
}

function pickyHybrid(remote: CollectionStorage<Item>, options: HybridStorageOptions = {}): { hybrid: HybridStorage<Item>; drops: DroppedWrite[] } {
  const drops: DroppedWrite[] = [];
  const hybrid = new HybridStorage<Item>(remote, {
    syncOnInit: false,
    mode: "write-back",
    syncInterval: ms(0),
    onDropped: (drop) => {
      drops.push(drop);
    },
    ...options,
  });
  return { hybrid, drops };
}

describe("onDropped gets each queued write that a conflict drops", () => {
  it("gets the value and the id on a conflict of a pull, under the default policy", async () => {
    const { server, hybrid, drops } = await queuedWrite();
    await server.set("a", item("a", 9, "2"));
    await hybrid.syncFromRemote();
    expect(drops).toEqual([{ id: "a", value: item("a", 5, "L"), reason: "conflict", during: "pull", remote: item("a", 9, "2") }]);
    expect(hybrid.getPendingOpsCount()).toBe(0);
    expect(await hybrid.get("a")).toEqual(item("a", 9, "2"));
    expect((await hybrid.getMetadata()).stats?.["dropped"]).toBe(1);
    await hybrid.close();
  });

  it("gets the value and the id on a conflict of a push", async () => {
    const { server, hybrid, drops } = await queuedWrite({ conflictResolution: "remote" });
    await server.set("a", item("a", 9, "2"));
    await hybrid.syncToRemote();
    expect(drops).toEqual([{ id: "a", value: item("a", 5, "L"), reason: "conflict", during: "push", remote: item("a", 9, "2") }]);
    expect(hybrid.getPendingOpsCount()).toBe(0);
    await hybrid.close();
  });

  it("gets no value for a queued delete that a conflict drops", async () => {
    const { server, hybrid, drops } = await queuedWrite();
    await hybrid.flush();
    await hybrid.delete("a");
    await server.set("a", item("a", 9, "2"));
    await hybrid.syncFromRemote();
    expect(drops).toEqual([{ id: "a", value: undefined, reason: "conflict", during: "pull", remote: item("a", 9, "2") }]);
    await hybrid.close();
  });

  it("gets the last value when an id has two queued writes", async () => {
    const { server, hybrid, drops } = await queuedWrite();
    await hybrid.set("a", item("a", 6, "M"));
    await server.set("a", item("a", 9, "2"));
    await hybrid.syncFromRemote();
    expect(drops).toEqual([{ id: "a", value: item("a", 6, "M"), reason: "conflict", during: "pull", remote: item("a", 9, "2") }]);
    await hybrid.close();
  });
});

describe("onDropped gets each queued write that a delete of the remote drops", () => {
  it("gets the value and the id in a pull", async () => {
    const { server, hybrid, drops } = await queuedWrite();
    await server.delete("a");
    await hybrid.syncFromRemote();
    expect(drops).toEqual([{ id: "a", value: item("a", 5, "L"), reason: "remote-delete", during: "pull" }]);
    expect(await hybrid.get("a")).toBeUndefined();
    expect(hybrid.getPendingOpsCount()).toBe(0);
    await hybrid.close();
  });

  it("gets the value and the id in a push", async () => {
    const { server, hybrid, drops } = await queuedWrite();
    await server.delete("a");
    await hybrid.syncToRemote();
    expect(drops).toEqual([{ id: "a", value: item("a", 5, "L"), reason: "remote-delete", during: "push" }]);
    expect(hybrid.getPendingOpsCount()).toBe(0);
    await hybrid.close();
  });
});

describe("onDropped gets each queued write that the remote refuses", () => {
  it("gets the value, the id and the error with no onRefused", async () => {
    const remote = new PickyRemote();
    const { hybrid, drops } = pickyHybrid(remote);
    remote.refused.add("bad");
    await hybrid.set("bad", item("bad", 9, "L"));
    await hybrid.set("b", item("b", 2, "L"));
    await hybrid.flush();
    expect(drops).toHaveLength(1);
    expect(drops[0]).toMatchObject({ id: "bad", value: item("bad", 9, "L"), reason: "refused", during: "push" });
    expect((drops[0]?.error as { code?: string }).code).toBe("FORBIDDEN");
    expect(await remote.get("b")).toEqual(item("b", 2, "L"));
    expect((await hybrid.getMetadata()).stats?.["dropped"]).toBe(1);
    await hybrid.close();
  });

  it("gets only the refused id of a refused batch, and the good id reaches the remote (CLI-108)", async () => {
    const remote = new PickyRemote();
    const refusals: string[][] = [];
    const { hybrid, drops } = pickyHybrid(remote, {
      onRefused: (refusal) => {
        refusals.push(refusal.ids === "*" ? ["*"] : refusal.ids);
      },
    });
    remote.refused.add("bad");
    await hybrid.setBatch([["bad", item("bad", 9, "L")], ["small", item("small", 1, "L")]]);
    await hybrid.flush();
    expect(refusals).toEqual([["bad"]]);
    expect(drops.map(({ id, value, reason }) => ({ id, value, reason }))).toEqual([{ id: "bad", value: item("bad", 9, "L"), reason: "refused" }]);
    expect(await remote.get("small")).toEqual(item("small", 1, "L"));
    expect(hybrid.getPendingOpsCount()).toBe(0);
    await hybrid.close();
  });

  it("gets no value for a refused delete, and only the refused id of a delete batch (CLI-108)", async () => {
    const remote = new PickyRemote();
    await remote.setBatch([["a", item("a", 1, "1")], ["b", item("b", 1, "1")], ["c", item("c", 1, "1")]]);
    const { hybrid, drops } = pickyHybrid(remote);
    await hybrid.syncFromRemote();
    remote.refused.add("a");
    remote.refused.add("b");
    await hybrid.delete("a");
    await hybrid.deleteBatch(["b", "c"]);
    await hybrid.flush();
    expect(drops.map(({ id, value }) => ({ id, value }))).toEqual([
      { id: "a", value: undefined },
      { id: "b", value: undefined },
    ]);
    expect(await remote.get("c")).toBeUndefined();
    await hybrid.close();
  });

  it("gets the id * for a refused clear", async () => {
    const remote = new PickyRemote();
    const { hybrid, drops } = pickyHybrid(remote);
    remote.refused.add("*");
    await hybrid.clear();
    await hybrid.flush();
    expect(drops).toHaveLength(1);
    expect(drops[0]).toMatchObject({ id: "*", value: undefined, reason: "refused", during: "push" });
    await hybrid.close();
  });
});

/** A remote with a limit of bytes on the JSON of each write, as a server with a body limit (roadmap CLI-108). */
class LimitedRemote extends InMemoryStorage<Item> {
  readonly sends: string[][] = [];
  private readonly limit: number;
  constructor(limit: number) {
    super();
    this.limit = limit;
  }
  private guard(ids: readonly string[], payload: unknown): void {
    this.sends.push([...ids]);
    if (JSON.stringify(payload).length > this.limit) throw Object.assign(new Error("too large"), { code: "PAYLOAD_TOO_LARGE", retryable: false });
  }
  override async set(id: string, value: Item) {
    this.guard([id], value);
    return super.set(id, value);
  }
  override async setBatch(items: Array<[string, Item]>) {
    this.guard(items.map(([id]) => id), items);
    return super.setBatch(items);
  }
}

const sized = (id: string, bytes: number): Item => ({ id, n: 1, rev: "x".repeat(bytes) });

describe("a write over the limit of the remote leaves the queue alone (CLI-108)", () => {
  it("drops one write over the limit with the reason too-large, and the writes behind it reach the remote", async () => {
    const remote = new LimitedRemote(1_000);
    const { hybrid, drops } = pickyHybrid(remote);
    await hybrid.set("big", sized("big", 5_000));
    await hybrid.set("a", sized("a", 10));
    await hybrid.set("b", sized("b", 10));
    await hybrid.flush();
    expect(drops.map(({ id, reason, during }) => ({ id, reason, during }))).toEqual([{ id: "big", reason: "too-large", during: "push" }]);
    expect((drops[0]!.error as { code?: unknown }).code).toBe("PAYLOAD_TOO_LARGE");
    expect(drops[0]!.value).toEqual(sized("big", 5_000));
    expect(await remote.get("a")).toEqual(sized("a", 10));
    expect(await remote.get("b")).toEqual(sized("b", 10));
    expect(hybrid.getPendingOpsCount()).toBe(0);
    await hybrid.close();
  });

  it("sends a batch over the limit as one write for each id, so only the large id drops", async () => {
    const remote = new LimitedRemote(1_000);
    const { hybrid, drops } = pickyHybrid(remote);
    await hybrid.setBatch([["s1", sized("s1", 10)], ["big", sized("big", 5_000)], ["s2", sized("s2", 10)]]);
    await hybrid.flush();
    expect(drops.map(({ id, reason }) => ({ id, reason }))).toEqual([{ id: "big", reason: "too-large" }]);
    expect(remote.sends).toEqual([["s1", "big", "s2"], ["s1"], ["big"], ["s2"]]);
    expect(await remote.getIds()).toEqual(expect.arrayContaining(["s1", "s2"]));
    expect(hybrid.getPendingOpsCount()).toBe(0);
    await hybrid.close();
  });

  it("sends a batch of small writes whose sum is over the limit, and drops none", async () => {
    const remote = new LimitedRemote(1_000);
    const { hybrid, drops } = pickyHybrid(remote);
    const ids = Array.from({ length: 12 }, (_, index) => `s${index}`);
    await hybrid.setBatch(ids.map((id): [string, Item] => [id, sized(id, 200)]));
    await hybrid.flush();
    expect(drops).toEqual([]);
    expect((await remote.getIds()).sort()).toEqual([...ids].sort());
    expect(hybrid.getPendingOpsCount()).toBe(0);
    await hybrid.close();
  });
});

describe("a hook of onDropped does not stop the sync", () => {
  it("writes the value again during a pull, and the write reaches the remote", async () => {
    const { server, hybrid } = await queuedWrite({
      onDropped: async (drop) => {
        await hybrid.set(drop.id, drop.value as Item);
      },
    });
    await server.set("a", item("a", 9, "2"));
    await hybrid.syncFromRemote();
    expect(hybrid.getPendingOpsCount()).toBe(1);
    await hybrid.syncToRemote();
    expect(await server.get("a")).toEqual(item("a", 5, "L"));
    expect(hybrid.getPendingOpsCount()).toBe(0);
    await hybrid.close();
  });

  it("writes the value again during a push, and the same push sends it", async () => {
    const { server, hybrid } = await queuedWrite({
      onDropped: async (drop) => {
        await hybrid.set(drop.id, drop.value as Item);
      },
    });
    await server.set("a", item("a", 9, "2"));
    await hybrid.syncToRemote();
    expect(await server.get("a")).toEqual(item("a", 5, "L"));
    expect(hybrid.getPendingOpsCount()).toBe(0);
    await hybrid.close();
  });

  it("goes on after an error of the hook", async () => {
    const remote = new PickyRemote();
    let calls = 0;
    const { hybrid } = pickyHybrid(remote, {
      onDropped: () => {
        calls++;
        throw new Error("a hook that fails");
      },
    });
    remote.refused.add("bad");
    await hybrid.set("bad", item("bad", 9, "L"));
    await hybrid.set("b", item("b", 2, "L"));
    await hybrid.flush();
    expect(calls).toBe(1);
    expect(await remote.get("b")).toEqual(item("b", 2, "L"));
    expect(hybrid.getPendingOpsCount()).toBe(0);
    await hybrid.close();
  });
});

describe("onDropped gets no call when no queued write leaves", () => {
  it("gets no call when the policy local keeps the write", async () => {
    const { server, hybrid, drops } = await queuedWrite({ conflictResolution: "local" });
    await server.set("a", item("a", 9, "2"));
    await hybrid.syncFromRemote();
    expect(drops).toEqual([]);
    expect(hybrid.getPendingOpsCount()).toBe(1);
    await hybrid.close();
  });

  it("gets no call on a pull with no queued write", async () => {
    const { server, hybrid, drops } = await queuedWrite();
    await hybrid.flush();
    await server.set("a", item("a", 9, "2"));
    await hybrid.syncFromRemote();
    expect(drops).toEqual([]);
    expect(await hybrid.get("a")).toEqual(item("a", 9, "2"));
    await hybrid.close();
  });

  it("gets no call when a queued clear keeps the id", async () => {
    const { server, hybrid, drops } = await queuedWrite();
    await hybrid.clear();
    await server.set("a", item("a", 9, "2"));
    await hybrid.syncFromRemote();
    expect(drops).toEqual([]);
    await hybrid.close();
  });

  it("gets no call for a write that reaches the remote", async () => {
    const { server, hybrid, drops } = await queuedWrite();
    await hybrid.flush();
    expect(drops).toEqual([]);
    expect(await server.get("a")).toEqual(item("a", 5, "L"));
    await hybrid.close();
  });
});
