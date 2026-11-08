/**
 * The merged send of the queue (roadmap CLI-121). With `pushBatch`, the push sends the run of queued
 * sets at the head of the queue as one `setBatch`. It sends the run of deletes as one `deleteBatch`.
 */

import { describe, expect, it } from "vitest";
import { InMemoryStorage, type StorageBatchWriteOptions, type StorageItemWriteOptions, type StorageWriteOptions } from "@procedures/collections";
import { ms } from "@procedures/client";
import { HybridStorage, type DroppedWrite, type HybridStorageOptions } from "./hybrid.js";

type Item = { id: string; n: number; rev: string };

const versionOf = (item: Item): string | undefined => item.rev;
const item = (id: string, n: number, rev = "L"): Item => ({ id, n, rev });

/** One call of the remote: its method, its ids and its expected versions. */
interface Call {
  readonly method: string;
  readonly ids: string[];
  readonly expected?: Array<[string, string | null]>;
}

const forbidden = (): Error => Object.assign(new Error("not allowed"), { code: "FORBIDDEN" });

/** A remote that records each write call. It refuses the ids in `refused`, and a call waits for `gate` when it is set. */
class RecordingRemote extends InMemoryStorage<Item> {
  readonly calls: Call[] = [];
  readonly refused = new Set<string>();
  gate: Promise<void> | undefined;
  started: (() => void) | undefined;
  private async record(call: Call): Promise<void> {
    this.calls.push(call);
    this.started?.();
    if (this.gate) await this.gate;
    if (call.ids.some((id) => this.refused.has(id))) throw forbidden();
  }
  override async set(id: string, value: Item, options?: StorageItemWriteOptions) {
    await this.record({ method: "set", ids: [id], ...(options?.expectedVersion !== undefined && { expected: [[id, options.expectedVersion]] }) });
    return super.set(id, value, options);
  }
  override async delete(id: string, options?: StorageItemWriteOptions) {
    await this.record({ method: "delete", ids: [id] });
    return super.delete(id, options);
  }
  override async setBatch(items: Array<[string, Item]>, options?: StorageBatchWriteOptions) {
    await this.record({ method: "setBatch", ids: items.map(([id]) => id), ...(options?.expectedVersions !== undefined && { expected: options.expectedVersions }) });
    return super.setBatch(items, options);
  }
  override async deleteBatch(ids: string[], options?: StorageWriteOptions) {
    await this.record({ method: "deleteBatch", ids: [...ids] });
    return super.deleteBatch(ids, options);
  }
}

function hybridOver(remote: RecordingRemote, options: HybridStorageOptions = {}): { hybrid: HybridStorage<Item>; drops: DroppedWrite[] } {
  const drops: DroppedWrite[] = [];
  const hybrid = new HybridStorage<Item>(remote, {
    mode: "write-back",
    syncOnInit: false,
    syncInterval: ms(0),
    pushBatch: {},
    onDropped: (drop) => {
      drops.push(drop);
    },
    ...options,
  });
  return { hybrid, drops };
}

const shape = (calls: readonly Call[]): string[] => calls.map(({ method, ids }) => `${method} ${ids.join(",")}`);

describe("the merged send of the queue (CLI-121)", () => {
  it("sends N queued sets as one remote call", async () => {
    const remote = new RecordingRemote();
    const { hybrid } = hybridOver(remote);
    for (let index = 0; index < 20; index++) await hybrid.set(`s${index}`, item(`s${index}`, index));
    await hybrid.flush();
    expect(remote.calls).toHaveLength(1);
    expect(remote.calls[0]!.method).toBe("setBatch");
    expect(remote.calls[0]!.ids).toEqual(Array.from({ length: 20 }, (_, index) => `s${index}`));
    expect(await remote.get("s7")).toEqual(item("s7", 7));
    expect(hybrid.getPendingOpsCount()).toBe(0);
    await hybrid.close();
  });

  it("sends each queued write alone without the option pushBatch", async () => {
    const remote = new RecordingRemote();
    const { hybrid } = hybridOver(remote, { pushBatch: undefined });
    for (let index = 0; index < 3; index++) await hybrid.set(`s${index}`, item(`s${index}`, index));
    await hybrid.flush();
    expect(shape(remote.calls)).toEqual(["set s0", "set s1", "set s2"]);
    await hybrid.close();
  });

  it("joins queued sets and set batches into one setBatch, in their order", async () => {
    const remote = new RecordingRemote();
    const { hybrid } = hybridOver(remote);
    await hybrid.set("a", item("a", 1));
    await hybrid.setBatch([["b", item("b", 2)], ["c", item("c", 3)]]);
    await hybrid.set("d", item("d", 4));
    await hybrid.flush();
    expect(shape(remote.calls)).toEqual(["setBatch a,b,c,d"]);
    await hybrid.close();
  });

  it("splits a refused merged batch, and only the bad write leaves the queue", async () => {
    const remote = new RecordingRemote();
    const { hybrid, drops } = hybridOver(remote);
    remote.refused.add("bad");
    await hybrid.set("a", item("a", 1));
    await hybrid.setBatch([["bad", item("bad", 9)], ["b", item("b", 2)]]);
    await hybrid.set("c", item("c", 3));
    await hybrid.flush();
    // The merged batch goes again as its writes: the set batch of the run splits as before (CLI-108)
    expect(shape(remote.calls)).toEqual(["setBatch a,bad,b,c", "set a", "setBatch bad,b", "set bad", "set b", "set c"]);
    expect(drops.map(({ id, reason }) => ({ id, reason }))).toEqual([{ id: "bad", reason: "refused" }]);
    expect((await remote.getIds()).sort()).toEqual(["a", "b", "c"]);
    expect(hybrid.getPendingOpsCount()).toBe(0);
    await hybrid.close();
  });

  it("keeps the order across a delete: a run stops at a write of another kind", async () => {
    const remote = new RecordingRemote();
    await remote.set("old", item("old", 0, "1"));
    remote.calls.length = 0;
    const { hybrid } = hybridOver(remote);
    await hybrid.syncFromRemote();
    await hybrid.set("a", item("a", 1));
    await hybrid.set("b", item("b", 2));
    await hybrid.delete("old");
    await hybrid.deleteBatch(["a"]);
    await hybrid.set("c", item("c", 3));
    await hybrid.set("a", item("a", 5));
    await hybrid.flush();
    expect(shape(remote.calls)).toEqual(["setBatch a,b", "deleteBatch old,a", "setBatch c,a"]);
    expect(await remote.get("a")).toEqual(item("a", 5));
    expect(await remote.get("old")).toBeUndefined();
    await hybrid.close();
  });

  it("sends a second write of an id in a later send", async () => {
    const remote = new RecordingRemote();
    const { hybrid } = hybridOver(remote);
    await hybrid.setBatch([["a", item("a", 1)], ["b", item("b", 1)]]);
    await hybrid.set("a", item("a", 2));
    await hybrid.set("c", item("c", 1));
    await hybrid.flush();
    expect(shape(remote.calls)).toEqual(["setBatch a,b", "setBatch a,c"]);
    expect(await remote.get("a")).toEqual(item("a", 2));
    await hybrid.close();
  });

  it("splits a long run at the cap of items", async () => {
    const remote = new RecordingRemote();
    const { hybrid } = hybridOver(remote, { pushBatch: { maxItems: 2 } });
    for (let index = 0; index < 5; index++) await hybrid.set(`s${index}`, item(`s${index}`, index));
    await hybrid.flush();
    expect(shape(remote.calls)).toEqual(["setBatch s0,s1", "setBatch s2,s3", "set s4"]);
    await hybrid.close();
  });

  it("splits a long run at the cap of bytes, and sends a write over the cap alone", async () => {
    const remote = new RecordingRemote();
    const { hybrid } = hybridOver(remote, { pushBatch: { maxBytes: 200 } });
    // The JSON of the data of a and b is 84 characters each, and of big 548
    await hybrid.set("a", item("a", 1, "x".repeat(40)));
    await hybrid.set("b", item("b", 1, "x".repeat(40)));
    await hybrid.set("big", item("big", 1, "x".repeat(500)));
    await hybrid.set("c", item("c", 1));
    await hybrid.flush();
    expect(shape(remote.calls)).toEqual(["setBatch a,b", "set big", "set c"]);
    await hybrid.close();
  });

  it("sends the base version of each item, and a conflict sends each write again alone", async () => {
    const remote = new RecordingRemote({ versionOf });
    await remote.setBatch([["a", item("a", 1, "1")], ["b", item("b", 1, "1")]]);
    const { hybrid, drops } = hybridOver(remote, { versionOf });
    await hybrid.syncFromRemote();
    remote.calls.length = 0;
    await hybrid.set("a", item("a", 5, "La"));
    await hybrid.set("b", item("b", 5, "Lb"));
    await remote.set("b", item("b", 9, "2"));
    remote.calls.length = 0;
    await hybrid.flush();
    expect(remote.calls[0]).toEqual({ method: "setBatch", ids: ["a", "b"], expected: [["a", "1"], ["b", "1"]] });
    expect(shape(remote.calls)).toEqual(["setBatch a,b", "set a", "set b"]);
    expect(remote.calls[1]!.expected).toEqual([["a", "1"]]);
    expect(await remote.get("a")).toEqual(item("a", 5, "La"));
    // The default policy `remote` keeps the remote item of the conflict
    expect(await hybrid.get("b")).toEqual(item("b", 9, "2"));
    expect(drops.map(({ id, reason }) => ({ id, reason }))).toEqual([{ id: "b", reason: "conflict" }]);
    expect(hybrid.getPendingOpsCount()).toBe(0);
    await hybrid.close();
  });

  it("sends a delete with a base version alone, because deleteBatch sends no base versions", async () => {
    const remote = new RecordingRemote({ versionOf });
    await remote.setBatch([["a", item("a", 1, "1")], ["b", item("b", 1, "1")]]);
    const { hybrid } = hybridOver(remote, { versionOf });
    await hybrid.syncFromRemote();
    remote.calls.length = 0;
    await hybrid.delete("a");
    await hybrid.delete("b");
    await hybrid.flush();
    expect(remote.calls).toEqual([
      { method: "delete", ids: ["a"] },
      { method: "delete", ids: ["b"] },
    ]);
    await hybrid.close();
  });

  it("keeps a new write of an id that a merged send has in flight", async () => {
    const remote = new RecordingRemote();
    const { hybrid } = hybridOver(remote);
    await hybrid.set("a", item("a", 1));
    await hybrid.set("b", item("b", 1));
    let open!: () => void;
    remote.gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const started = new Promise<void>((resolve) => {
      remote.started = resolve;
    });
    const push = hybrid.flush();
    await started;
    remote.started = undefined;
    remote.gate = undefined;
    await hybrid.set("b", item("b", 2));
    open();
    await push;
    await hybrid.flush();
    expect(await remote.get("b")).toEqual(item("b", 2));
    expect(hybrid.getPendingOpsCount()).toBe(0);
    await hybrid.close();
  });

  it("refuses a cap that is not a whole number of 1 or more", () => {
    const remote = new RecordingRemote();
    expect(() => hybridOver(remote, { pushBatch: { maxItems: 0 } })).toThrow(RangeError);
    expect(() => hybridOver(remote, { pushBatch: { maxBytes: 1.5 } })).toThrow(RangeError);
  });
});
