/**
 * The rules of the rows of a served collection (roadmap CLI-41). The option `admission` of
 * `createCollectionProcedures()` gives a filter of each row of a read and a guard of each write.
 * The procedures apply both in one place, the view of the storage of a call.
 */

import { describe, it, expect } from "vitest";
import { createCollectionProcedures, type CollectionProceduresOptions } from "./procedures.js";
import { admittedStorage, type CollectionAdmission, type CollectionWrite } from "./admission.js";
import { applyPatch, queryEntries, type StoragePatch, type StorageQueryOptions, type StorageQueryPolicy, type StorageSelector } from "./query.js";
import type { CollectionChangeEvent } from "./changes.js";
import type { CollectionStorage, StorageChanges } from "./storage.js";
import { invokeProcedure, outputValue, type AdmitItem } from "../invoke.js";
import type { ProcedureContext, RepositoryProvider } from "../types.js";
import type { Principal } from "../../server/types.js";
import { createEventBus } from "../../events/bus.js";
import { EventPublisher } from "../../events/publisher.js";
import type { EventItem } from "../../events/remote.js";

/** A storage of a Map with a change log (`v:<number>`), and with `query()` and `patch()` when asked. */
class RowStorage implements CollectionStorage<unknown> {
  readonly data = new Map<string, unknown>();
  private seq = 0;
  private readonly changedAt = new Map<string, number>();
  private readonly deletedAt = new Map<string, number>();
  /** The pages that `query()` gave: the skip and the limit of each call. */
  readonly pages: Array<{ skip: number | undefined; limit: number | undefined }> = [];
  query?: CollectionStorage<unknown>["query"];
  patch?: CollectionStorage<unknown>["patch"];

  constructor(features: { query?: boolean; patch?: boolean } = {}) {
    if (features.query) {
      this.query = async (selector: StorageSelector, options?: StorageQueryOptions, policy?: StorageQueryPolicy) => {
        this.pages.push({ skip: options?.skip, limit: options?.limit });
        return queryEntries([...this.data.entries()], selector, options ?? {}, policy);
      };
    }
    if (features.patch) {
      this.patch = async (id: string, fields: StoragePatch) => {
        const current = this.data.get(id);
        if (current === undefined) return undefined;
        const next = applyPatch(current, fields);
        this.write(id, next);
        return next;
      };
    }
  }

  /** A copy of the items, to compare the storage before and after a call. */
  snapshot(): Array<[string, unknown]> {
    return structuredClone([...this.data.entries()]);
  }
  private write(id: string, value: unknown): void {
    this.data.set(id, value);
    this.changedAt.set(id, ++this.seq);
    this.deletedAt.delete(id);
  }
  private remove(id: string): boolean {
    const existed = this.data.delete(id);
    if (existed) {
      this.deletedAt.set(id, ++this.seq);
      this.changedAt.delete(id);
    }
    return existed;
  }
  async get(id: string) {
    return this.data.get(id);
  }
  async getAll() {
    return [...this.data.values()];
  }
  async getEntries() {
    return [...this.data.entries()];
  }
  async getChangesSince(since?: string): Promise<StorageChanges<unknown>> {
    const version = `v:${this.seq}`;
    if (since === undefined) return { version, full: true, changed: [...this.data.entries()], deleted: [] };
    const from = Number(since.slice(2));
    const changed = [...this.changedAt].filter(([, at]) => at > from).map(([id]): [string, unknown] => [id, this.data.get(id)]);
    const deleted = [...this.deletedAt].filter(([, at]) => at > from).map(([id]) => id);
    return { version, full: false, changed, deleted };
  }
  async find(predicate: (item: unknown) => boolean) {
    return [...this.data.values()].filter(predicate);
  }
  async has(id: string) {
    return this.data.has(id);
  }
  async size() {
    return this.data.size;
  }
  async set(id: string, value: unknown) {
    this.write(id, value);
  }
  async delete(id: string) {
    return this.remove(id);
  }
  async clear() {
    for (const id of [...this.data.keys()]) this.remove(id);
  }
  async setBatch(items: Array<[string, unknown]>) {
    for (const [id, value] of items) this.write(id, value);
  }
  async deleteBatch(ids: string[]) {
    let count = 0;
    for (const id of ids) if (this.remove(id)) count++;
    return count;
  }
  async getBatch(ids: string[]) {
    return new Map(ids.filter((id) => this.data.has(id)).map((id): [string, unknown] => [id, this.data.get(id)]));
  }
  async close() {}
}

const ann: Principal = { id: "ann", via: "test" };
const bob: Principal = { id: "bob", via: "test" };

/** The owner of a stored note. */
const ownerOf = (value: unknown): unknown => (typeof value === "object" && value !== null ? (value as Record<string, unknown>)["owner"] : undefined);

/** The rule of the rows: a note is for its owner, and a public note is for each caller. */
const ownRows: AdmitItem = (row, invocation) => {
  const value = (row as { value: unknown }).value as Record<string, unknown> | null;
  return value?.["public"] === true || ownerOf(value) === invocation.principal?.id;
};

/** The guard: a caller writes only its own notes, and a write cannot give a note to another owner. */
const ownWrites = (seen: CollectionWrite[] = []) => (write: CollectionWrite, invocation: { principal?: Principal | undefined }) => {
  seen.push(write);
  const me = invocation.principal?.id;
  if (write.prev !== undefined && ownerOf(write.prev) !== me) return false;
  return write.op === "delete" || ownerOf(write.doc) === me;
};

/** The procedures of the collection "notes" on one storage, with a bus. */
function host(storage: RowStorage, options: CollectionProceduresOptions = {}) {
  const procedures = createCollectionProcedures("notes", options);
  const bus = createEventBus();
  const repository: RepositoryProvider = { getStorage: <T>() => storage as unknown as CollectionStorage<T>, hasCollection: (name) => name === "notes" };
  const run = async (operation: string, input: unknown, principal?: Principal): Promise<unknown> => {
    const procedure = procedures.find((candidate) => candidate.path[2] === operation)!;
    return outputValue(await invokeProcedure(procedure, input, { repository, bus, ...(principal ? { principal } : {}) }), procedure.path);
  };
  return { run, bus, repository };
}

/** The error of a call. */
async function errorOf(call: Promise<unknown>): Promise<Error & { code?: string; reason?: string }> {
  try {
    await call;
  } catch (error) {
    return error as Error & { code?: string; reason?: string };
  }
  throw new Error("the call did not fail");
}

/** A storage with the notes of Ann and Bob, and one public note of Bob. */
function notes(features: { query?: boolean; patch?: boolean } = {}): RowStorage {
  const storage = new RowStorage(features);
  storage.data.set("a1", { owner: "ann", text: "A1", n: 1 });
  storage.data.set("b1", { owner: "bob", text: "B1", n: 2 });
  storage.data.set("a2", { owner: "ann", text: "A2", n: 3 });
  storage.data.set("p1", { owner: "bob", text: "P1", n: 4, public: true });
  return storage;
}

describe("the rule of the rows of each read (CLI-41)", () => {
  for (const features of [{}, { query: true }]) {
    it(`never gives a row that the rule refuses${features.query ? ", with query() of the storage" : ""}`, async () => {
      const { run } = host(notes(features), { admission: { admit: ownRows } });
      expect(await run("get", { id: "a1" }, ann)).toEqual({ owner: "ann", text: "A1", n: 1 });
      expect(await run("get", { id: "b1" }, ann)).toBeUndefined();
      expect(await run("get", { id: "b1", found: true }, ann)).toEqual({ found: false });
      expect(await run("get", { id: "p1" }, ann)).toMatchObject({ text: "P1" });
      expect(await run("has", { id: "b1" }, ann)).toBe(false);
      expect(await run("has", { id: "a1" }, ann)).toBe(true);
      expect(await run("getAll", {}, ann)).toEqual([expect.objectContaining({ text: "A1" }), expect.objectContaining({ text: "A2" }), expect.objectContaining({ text: "P1" })]);
      expect(((await run("entries", {}, ann)) as Array<{ id: string }>).map((row) => row.id)).toEqual(["a1", "a2", "p1"]);
      expect(await run("ids", {}, ann)).toEqual(["a1", "a2", "p1"]);
      expect(await run("size", {}, ann)).toBe(3);
      expect(await run("getBatch", { ids: ["a1", "b1", "p1"] }, ann)).toEqual({ a1: expect.objectContaining({ text: "A1" }), p1: expect.objectContaining({ text: "P1" }) });
      expect(((await run("find", { selector: {} }, ann)) as Array<{ id: string }>).map((row) => row.id)).toEqual(["a1", "a2", "p1"]);
      expect(((await run("find", { selector: { owner: "bob" } }, ann)) as Array<{ id: string }>).map((row) => row.id)).toEqual(["p1"]);
      expect(await run("changes", {}, ann)).toMatchObject({ full: true, changed: [{ id: "a1" }, { id: "a2" }, { id: "p1" }], deleted: [] });
      // Bob gets his rows and the public row
      expect(await run("ids", {}, bob)).toEqual(["b1", "p1"]);
    });
  }

  it("counts the skip and the limit of find in the admitted rows, page by page of the storage", async () => {
    const storage = new RowStorage({ query: true });
    for (let n = 0; n < 12; n++) storage.data.set(`n${String(n).padStart(2, "0")}`, { owner: n % 3 === 0 ? "ann" : "bob", n });
    const { run } = host(storage, { admission: { admit: ownRows }, queryPolicy: { maxLimit: 2 } });
    // Ann has n00, n03, n06 and n09
    const page = (await run("find", { selector: {}, sort: { n: 1 }, skip: 1, limit: 2 }, ann)) as Array<{ id: string }>;
    expect(page.map((row) => row.id)).toEqual(["n03", "n06"]);
    // The storage gave pages of the maxLimit, and each page has the sort of the call
    expect(storage.pages.every((query) => query.limit === 2)).toBe(true);
    expect(storage.pages.map((query) => query.skip)).toEqual([0, 2, 4, 6]);
  });

  it("puts the id of a refused row of a delta in deleted, so a copy drops it", async () => {
    const storage = notes();
    const { run } = host(storage, { admission: { admit: ownRows } });
    const first = (await run("changes", {}, ann)) as { version: string };
    // Bob takes a1 from Ann, and writes b2 of his own
    await storage.set("a1", { owner: "bob", text: "A1" });
    await storage.set("b2", { owner: "bob" });
    await storage.set("a3", { owner: "ann" });
    const delta = (await run("changes", { since: first.version }, ann)) as { full: boolean; changed: Array<{ id: string }>; deleted: string[] };
    expect(delta.full).toBe(false);
    expect(delta.changed.map((row) => row.id)).toEqual(["a3"]);
    expect(delta.deleted.sort()).toEqual(["a1", "b2"]);
  });

  it("gives a patch the found mark without the value when the rule refuses the new item", async () => {
    const { run } = host(notes(), { admission: { admit: ownRows, guard: () => true } });
    expect(await run("patch", { id: "a1", fields: { owner: "bob" } }, ann)).toEqual({ found: true });
    expect(await run("patch", { id: "a2", fields: { n: 9 } }, ann)).toEqual({ found: true, value: { owner: "ann", text: "A2", n: 9 } });
  });

  it("fails a read when the rule fails: it does not hide the rows", async () => {
    const { run } = host(notes(), { admission: { admit: () => Promise.reject(new Error("the access lists are not available")) } });
    await expect(run("getAll", {}, ann)).rejects.toThrow(/access lists/);
    await expect(run("changes", {}, ann)).rejects.toThrow(/access lists/);
  });

  it("gives no row to a context without an invocation", async () => {
    const storage = notes();
    const view = admittedStorage(storage, { admit: ownRows }, { metadata: {}, path: ["collections", "notes", "get"] } as unknown as ProcedureContext);
    expect(await view.get("a1")).toBeUndefined();
    expect(await view.getAll()).toEqual([]);
  });

  it("changes nothing without the option: the view is the storage", async () => {
    const storage = notes();
    const ctx = { metadata: {}, path: ["collections", "notes", "get"] } as unknown as ProcedureContext;
    expect(admittedStorage(storage, undefined, ctx)).toBe(storage);
    expect(admittedStorage(storage, {}, ctx)).toBe(storage);
    const { run } = host(storage);
    expect(await run("ids", {}, ann)).toEqual(["a1", "b1", "a2", "p1"]);
    expect(await run("get", { id: "b1" }, ann)).toMatchObject({ text: "B1" });
    await run("set", { id: "b1", value: { owner: "ann" } }, ann);
    expect(storage.data.get("b1")).toEqual({ owner: "ann" });
  });
});

describe("the guard of each write (CLI-41)", () => {
  const writes: Array<[string, unknown]> = [
    ["set", { id: "b1", value: { owner: "ann", text: "taken" } }],
    ["set", { id: "new", value: { owner: "bob" } }],
    ["patch", { id: "b1", fields: { text: "changed" } }],
    ["patch", { id: "a1", fields: { owner: "bob" } }],
    ["delete", { id: "b1" }],
    ["setBatch", { items: [{ id: "a1", value: { owner: "ann", text: "ok" } }, { id: "b1", value: { owner: "ann" } }] }],
    ["deleteBatch", { ids: ["a1", "b1"] }],
    ["clear", {}],
  ];

  for (const patch of [false, true]) {
    for (const [operation, input] of writes) {
      it(`refuses ${operation} ${JSON.stringify(input)} with FORBIDDEN before the storage changes${patch ? ", with patch() of the storage" : ""}`, async () => {
        const storage = notes({ patch });
        const before = storage.snapshot();
        const { run } = host(storage, { admission: { guard: ownWrites() } });
        const error = await errorOf(run(operation, input, ann));
        expect(error.code).toBe("FORBIDDEN");
        expect(error.reason).toBe("write-not-allowed");
        expect(storage.snapshot()).toEqual(before);
      });
    }
  }

  it("gives the guard the operation, the id, the new item and the stored item", async () => {
    const seen: CollectionWrite[] = [];
    const storage = notes();
    const { run } = host(storage, { admission: { guard: ownWrites(seen) } });
    await run("set", { id: "a1", value: { owner: "ann", text: "A1+" } }, ann);
    await run("set", { id: "a9", value: { owner: "ann" } }, ann);
    await run("patch", { id: "a2", fields: { n: 30 } }, ann);
    await run("delete", { id: "a9" }, ann);
    expect(seen).toEqual([
      { op: "set", id: "a1", doc: { owner: "ann", text: "A1+" }, prev: { owner: "ann", text: "A1", n: 1 } },
      { op: "set", id: "a9", doc: { owner: "ann" }, prev: undefined },
      { op: "patch", id: "a2", doc: { owner: "ann", text: "A2", n: 30 }, prev: { owner: "ann", text: "A2", n: 3 } },
      { op: "delete", id: "a9", doc: undefined, prev: { owner: "ann" } },
    ]);
    expect(storage.data.get("a2")).toEqual({ owner: "ann", text: "A2", n: 30 });
  });

  it("permits the writes that the guard permits, also the batches and a clear of own rows", async () => {
    const storage = new RowStorage();
    storage.data.set("a1", { owner: "ann" });
    const { run } = host(storage, { admission: { guard: ownWrites() } });
    await run("setBatch", { items: [{ id: "a2", value: { owner: "ann" } }, { id: "a3", value: { owner: "ann" } }] }, ann);
    expect(await run("deleteBatch", { ids: ["a2"] }, ann)).toBe(1);
    await run("clear", {}, ann);
    expect(storage.data.size).toBe(0);
    // A patch or a delete of a missing id changes nothing
    expect(await run("patch", { id: "zz", fields: { n: 1 } }, ann)).toEqual({ found: false });
  });

  it("passes an error of the guard through, and the storage does not change", async () => {
    const storage = notes();
    const before = storage.snapshot();
    const { run } = host(storage, { admission: { guard: () => Promise.reject(new Error("the lists are not available")) } });
    await expect(run("set", { id: "a1", value: { owner: "ann" } }, ann)).rejects.toThrow(/lists are not available/);
    expect(storage.snapshot()).toEqual(before);
  });

  it("refuses each write of a context without an invocation", async () => {
    const storage = notes();
    const view = admittedStorage(storage, { guard: () => true }, { metadata: {}, path: ["collections", "notes", "set"] } as unknown as ProcedureContext);
    await expect(view.set("a1", { owner: "ann" })).rejects.toMatchObject({ code: "FORBIDDEN", reason: "write-not-allowed" });
    expect(storage.data.get("a1")).toEqual({ owner: "ann", text: "A1", n: 1 });
  });
});

describe("the rule of the rows of the change events (CLI-41)", () => {
  /** A subscription of a principal to the topic of the notes. */
  async function subscribe(h: ReturnType<typeof host>, principal: Principal) {
    const publisher = new EventPublisher({ bus: h.bus, topics: ["collections.*"] });
    const controller = new AbortController();
    const output = await invokeProcedure(publisher.procedure, { topics: ["collections.notes"] }, { bus: h.bus, repository: h.repository, signal: controller.signal, principal });
    if (output.kind !== "stream") throw new Error("events.subscribe gives a stream");
    const items = output.items as AsyncGenerator<EventItem, void, undefined>;
    await items.next();
    const received: CollectionChangeEvent[] = [];
    void (async () => {
      for await (const item of items) if (item.type === "event") received.push(item.data as CollectionChangeEvent);
    })().catch(() => undefined);
    return { received, stop: () => controller.abort() };
  }
  /** A few turns of the event loop: each event on the bus reaches the loop of its subscriber. */
  const settle = async () => {
    for (let turn = 0; turn < 5; turn++) await new Promise((resolve) => setImmediate(resolve));
  };

  it("gives each subscriber of an event with values only the rows that the rule admits for it", async () => {
    const admission: CollectionAdmission = { admit: ownRows };
    const h = host(notes(), { admission, changeEvents: { values: true } });
    const annSub = await subscribe(h, ann);
    const bobSub = await subscribe(h, bob);
    // A pull starts the chain of the events
    await h.run("changes", {}, ann);
    await h.run("setBatch", { items: [{ id: "a5", value: { owner: "ann" } }, { id: "b5", value: { owner: "bob" } }] }, ann);
    await settle();
    expect(annSub.received.map((event) => event.values?.map((row) => row.id))).toEqual([["a5"]]);
    expect(annSub.received[0]!.withheld).toEqual(["b5"]);
    expect(bobSub.received.map((event) => event.values?.map((row) => row.id))).toEqual([["b5"]]);
    expect(bobSub.received[0]!.withheld).toEqual(["a5"]);
    annSub.stop();
    bobSub.stop();
  });
});
