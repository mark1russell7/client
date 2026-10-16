/**
 * The contract of `CollectionStorage` as one test suite (finding of roadmap R45).
 *
 * Each storage package runs the suite with a factory of its storage: `InMemoryStorage` in this
 * package, `ApiStorage` and `HybridStorage` in `@procedures/store`, and `SqliteStorage` in
 * `@procedures/sqlite`. Before, each package copied the cases of `InMemoryStorage`.
 *
 * The suite is in the test-only entry `@procedures/collections/testing`. It imports no test
 * framework: the caller gives `describe` and `it`, and the checks throw `ContractViolation`. So a
 * storage package imports the suite without a cycle, and a runtime entry never loads vitest.
 *
 * ```ts
 * import { describe, it } from "vitest";
 * import { describeCollectionStorageContract } from "@procedures/collections/testing";
 *
 * describeCollectionStorageContract("MyStorage", { create: () => new MyStorage() }, { describe, it });
 * ```
 */

import type { CollectionStorage, StorageChanges } from "../storage/interface.js";
import { byId, holds, rejects, same, show } from "./check.js";

/** The item of the suite. Its `id` is its key, so a `HybridStorage` can sync it. */
export interface ContractItem {
  id: string;
  n: number;
  tags?: string[];
}

/** A storage of the suite. */
export type ContractStorage = CollectionStorage<ContractItem>;

/** The options of the suite: the factory of the storage, and what the storage keeps. */
export interface CollectionStorageContractOptions {
  /** This function makes a new, empty storage for each case. The case closes it at its end. */
  create(): ContractStorage | Promise<ContractStorage>;
  /**
   * This function makes a new, empty storage whose change log keeps at most `max` deletes. With it,
   * the suite tests the drop of the old deletes. A storage without such a limit does not give it.
   */
  createWithMaxTombstones?: ((max: number) => ContractStorage | Promise<ContractStorage>) | undefined;
  /**
   * True when the storage keeps a copy of each value: a change of a value after `set`, or of a read
   * value, does not change the stored item. The interface does not ask for copies, so the default
   * is false, and the suite then does not test them.
   */
  copies?: boolean | undefined;
  /**
   * False when a stored `null` reads back as `undefined`. A remote storage can lose the difference
   * on the wire. The default is true.
   */
  nullValues?: boolean | undefined;
}

/** The context that a test framework gives to a case. Vitest gives `skip`. */
export interface ContractTestContext {
  skip?(note?: string): void;
}

/** One case of the suite. */
export interface ContractCase {
  readonly name: string;
  run(context?: ContractTestContext): Promise<void>;
}

/** The functions of a test framework that the suite uses: `describe` and `it` of vitest fit. */
export interface ContractTestApi {
  describe(name: string, body: () => void): unknown;
  it(name: string, body: (context: ContractTestContext) => Promise<void>): unknown;
}

const item = (id: string, n: number, tags?: string[]): ContractItem => (tags === undefined ? { id, n } : { id, n, tags });
const ids = (items: ContractItem[]): string[] => items.map((value) => value.id);

/** True for a value with a `then` function. */
function isPromise(value: unknown): boolean {
  return typeof (value as { then?: unknown } | null)?.then === "function";
}

/** This function makes a storage, runs the body, and closes the storage. */
async function withStorage(create: () => ContractStorage | Promise<ContractStorage>, body: (storage: ContractStorage) => Promise<void>): Promise<void> {
  const storage = await create();
  try {
    await body(storage);
  } finally {
    await storage.close().catch(() => undefined);
  }
}

/** The changes of a storage that has `getChangesSince`. */
function changesOf(storage: ContractStorage): (since?: string) => Promise<StorageChanges<ContractItem>> {
  return (since) => storage.getChangesSince!(since);
}

/** This function skips a case for a storage without an optional method, and gives true. */
function lacks(storage: ContractStorage, method: "getEntries" | "getChangesSince" | "flush" | "getMetadata", context: ContractTestContext | undefined): boolean {
  if (typeof storage[method] === "function") return false;
  context?.skip?.(`The storage has no ${method}()`);
  return true;
}

/** A random number generator with a seed, so a failed sequence comes again in the next run. */
function seeded(seed: number): (below: number) => number {
  let state = seed >>> 0;
  return (below) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % below;
  };
}

/**
 * This function gives the cases of the contract for a storage. Each case makes its own storage
 * with `options.create`. A case for an optional method (`getEntries`, `getChangesSince`, `flush`,
 * `getMetadata`) skips a storage without the method.
 */
export function collectionStorageContract(options: CollectionStorageContractOptions): ContractCase[] {
  const create = (): ContractStorage | Promise<ContractStorage> => options.create();
  const nullValues = options.nullValues ?? true;
  const cases: ContractCase[] = [];
  const add = (name: string, run: (context?: ContractTestContext) => Promise<void>): void => {
    cases.push({ name, run });
  };

  add("each method gives a promise", () =>
    withStorage(create, async (storage) => {
      const results: Array<[string, unknown]> = [
        ["get", storage.get("a")],
        ["getAll", storage.getAll()],
        ["find", storage.find(() => true)],
        ["has", storage.has("a")],
        ["size", storage.size()],
        ["getBatch", storage.getBatch(["a"])],
      ];
      for (const [name, result] of results) holds(isPromise(result), `${name}() did not give a promise`);
      await Promise.all(results.map(([, result]) => result));
      for (const [name, start] of [
        ["set", () => storage.set("a", item("a", 1))],
        ["setBatch", () => storage.setBatch([["b", item("b", 2)]])],
        ["delete", () => storage.delete("a")],
        ["deleteBatch", () => storage.deleteBatch(["b"])],
        ["clear", () => storage.clear()],
      ] as Array<[string, () => Promise<unknown>]>) {
        const result = start();
        holds(isPromise(result), `${name}() did not give a promise`);
        await result;
      }
    }),
  );

  add("an empty storage has no item", () =>
    withStorage(create, async (storage) => {
      same(await storage.size(), 0, "size() of an empty storage");
      same(await storage.getAll(), [], "getAll() of an empty storage");
      same(await storage.get("a"), undefined, "get() of a missing id");
      same(await storage.has("a"), false, "has() of a missing id");
      same(await storage.getBatch(["a", "b"]), new Map(), "getBatch() of missing ids");
      same(await storage.find(() => true), [], "find() in an empty storage");
      same(await storage.delete("a"), false, "delete() of a missing id");
      same(await storage.deleteBatch(["a", "b"]), 0, "deleteBatch() of missing ids");
      if (storage.getEntries) same(await storage.getEntries(), [], "getEntries() of an empty storage");
    }),
  );

  add("set() stores an item, and a second set() of the id replaces it", () =>
    withStorage(create, async (storage) => {
      await storage.set("a", item("a", 1, ["x"]));
      await storage.set("b", item("b", 2));
      same(await storage.get("a"), item("a", 1, ["x"]), "get() after set()");
      same(await storage.has("a"), true, "has() after set()");
      same(await storage.size(), 2, "size() after two set() calls");
      await storage.set("a", item("a", 10));
      same(await storage.get("a"), item("a", 10), "get() after a second set() of the id");
      same(await storage.size(), 2, "size() after a second set() of an id");
    }),
  );

  add("delete() gives true for an item that existed, and deleteBatch() counts the items that existed", () =>
    withStorage(create, async (storage) => {
      await storage.setBatch([["a", item("a", 1)], ["b", item("b", 2)], ["c", item("c", 3)]]);
      same(await storage.delete("a"), true, "delete() of an item");
      same(await storage.delete("a"), false, "a second delete() of the id");
      same(await storage.has("a"), false, "has() after delete()");
      same(await storage.get("a"), undefined, "get() after delete()");
      same(await storage.deleteBatch(["b", "missing", "b"]), 1, "deleteBatch() with a missing id and a repeated id");
      same(ids(await storage.getAll()), ["c"], "getAll() after the deletes");
    }),
  );

  add("setBatch() and getBatch(): the last value of an id wins, a missing id is not in the map, and empty batches change nothing", () =>
    withStorage(create, async (storage) => {
      await storage.setBatch([["a", item("a", 1)], ["b", item("b", 2)], ["a", item("a", 3)]]);
      same(await storage.get("a"), item("a", 3), "get() of an id that setBatch() set two times");
      same(await storage.size(), 2, "size() after setBatch() with a repeated id");
      same(
        await storage.getBatch(["b", "missing", "a"]),
        new Map([["b", item("b", 2)], ["a", item("a", 3)]]),
        "getBatch() with a missing id",
      );
      await storage.setBatch([]);
      same(await storage.deleteBatch([]), 0, "deleteBatch() of no id");
      same(await storage.getBatch([]), new Map(), "getBatch() of no id");
      same(await storage.size(), 2, "size() after the empty batches");
    }),
  );

  add("the entries keep the order of the first set() of each id, as a Map does", () =>
    withStorage(create, async (storage) => {
      await storage.setBatch([["c", item("c", 3)], ["a", item("a", 1)], ["b", item("b", 2)]]);
      await storage.set("a", item("a", 10));
      same(ids(await storage.getAll()), ["c", "a", "b"], "getAll() after a second set() of an id: the id keeps its place");
      // A delete, then a set: the id goes to the end
      await storage.delete("c");
      await storage.set("c", item("c", 30));
      const expected: Array<[string, ContractItem]> = [["a", item("a", 10)], ["b", item("b", 2)], ["c", item("c", 30)]];
      same(await storage.getAll(), expected.map(([, value]) => value), "getAll() after a delete and a new set() of an id");
      same(ids(await storage.find(() => true)), ["a", "b", "c"], "find() keeps the order of the entries");
      if (storage.getEntries) same(await storage.getEntries(), expected, "getEntries() keeps the order of the entries");
    }),
  );

  add("find() gives the matching items in order, and an error of the predicate rejects the promise", () =>
    withStorage(create, async (storage) => {
      await storage.setBatch([["a", item("a", 1)], ["b", item("b", 2)], ["c", item("c", 3)], ["d", item("d", 4)]]);
      same(ids(await storage.find((value) => value.n % 2 === 0)), ["b", "d"], "find() of the even items");
      same(await storage.find(() => false), [], "find() without a match");
      const error = await rejects(
        () =>
          storage.find(() => {
            throw new Error("the predicate failed");
          }),
        "find() with a predicate that throws",
      );
      holds(error instanceof Error && error.message.includes("the predicate failed"), `find() must reject with the error of the predicate, not ${show(error instanceof Error ? error.message : error)}`);
    }),
  );

  add("clear() deletes every item, and the storage takes new items after it", () =>
    withStorage(create, async (storage) => {
      await storage.setBatch([["a", item("a", 1)], ["b", item("b", 2)], ["c", item("c", 3)]]);
      await storage.clear();
      same(await storage.size(), 0, "size() after clear()");
      same(await storage.getAll(), [], "getAll() after clear()");
      same(await storage.has("a"), false, "has() after clear()");
      await storage.clear();
      await storage.set("d", item("d", 4));
      same(await storage.getAll(), [item("d", 4)], "getAll() after clear() and set()");
    }),
  );

  add("each result is a new array or map: a change of a result does not change the storage", () =>
    withStorage(create, async (storage) => {
      await storage.setBatch([["a", item("a", 1)], ["b", item("b", 2)]]);
      const all = await storage.getAll();
      all.pop();
      all.push(item("z", 0));
      const found = await storage.find(() => true);
      found.length = 0;
      const batch = await storage.getBatch(["a"]);
      batch.delete("a");
      batch.set("z", item("z", 0));
      if (storage.getEntries) (await storage.getEntries()).splice(0);
      same(ids(await storage.getAll()), ["a", "b"], "getAll() after changes of the results");
      same(await storage.has("z"), false, "has() of an id that only a result got");
      same(await storage.getBatch(["a"]), new Map([["a", item("a", 1)]]), "getBatch() after a change of a result");
    }),
  );

  if (options.copies) {
    add("the storage keeps copies: a change of a written or a read value does not change the item", () =>
      withStorage(create, async (storage) => {
        const value = item("a", 1, ["x"]);
        await storage.set("a", value);
        value.n = 99;
        value.tags!.push("changed after set");
        const read = (await storage.get("a"))!;
        same(read, item("a", 1, ["x"]), "get() after a change of the value that set() took");
        read.n = 98;
        read.tags!.push("changed after get");
        (await storage.getAll())[0]!.n = 97;
        (await storage.getBatch(["a"])).get("a")!.n = 96;
        (await storage.find(() => true))[0]!.n = 95;
        same(await storage.get("a"), item("a", 1, ["x"]), "get() after changes of the read values");
      }),
    );
  }

  add(`the storage keeps JSON values${nullValues ? ", also null" : ""}`, () =>
    withStorage(create, async (typed) => {
      const storage = typed as unknown as CollectionStorage<unknown>;
      const values: Array<[string, unknown]> = [
        ["object", { text: "é ✓ 😀", list: [1, null, { deep: true }], n: 1.5, empty: {}, none: [] }],
        ["text", "plain"],
        ["empty", ""],
        ["zero", 0],
        ["negative", -2.25],
        ["false", false],
        ["list", [1, "two", [3]]],
      ];
      if (nullValues) values.push(["null", null]);
      await storage.setBatch(values);
      for (const [id, value] of values) same(await storage.get(id), value, `get("${id}")`);
      same(await storage.getAll(), values.map(([, value]) => value), "getAll() of the JSON values");
      same(await storage.getBatch(values.map(([id]) => id)), new Map(values), "getBatch() of the JSON values");
      same(await storage.size(), values.length, "size() with the JSON values");
      if (nullValues) same(await storage.has("null"), true, "has() of an id whose value is null");
    }),
  );

  add("writes that run at the same time keep each write", () =>
    withStorage(create, async (storage) => {
      const count = 20;
      await Promise.all(Array.from({ length: count }, (_, n) => storage.set(`k${n}`, item(`k${n}`, n))));
      same(await storage.size(), count, `size() after ${count} writes at the same time`);
      same(ids(await storage.getAll()).sort(), Array.from({ length: count }, (_, n) => `k${n}`).sort(), "the ids after the writes at the same time");
    }),
  );

  add("getChangesSince() without a version gives every item", (context) =>
    withStorage(create, async (storage) => {
      if (lacks(storage, "getChangesSince", context)) return;
      const changes = changesOf(storage);
      const entries: Array<[string, ContractItem]> = [["a", item("a", 1)], ["b", item("b", 2)], ["c", item("c", 3)]];
      await storage.setBatch(entries);
      const first = await changes();
      holds(typeof first.version === "string" && first.version !== "", `the version must be a text that is not empty, not ${show(first.version)}`);
      same(first.full, true, "full of the first call");
      same(byId(first.changed), entries, "changed of the first call: every item");
      same(first.deleted, [], "deleted of a full result");
    }),
  );

  add("getChangesSince(version) gives the items that changed after the version and the ids that were deleted", (context) =>
    withStorage(create, async (storage) => {
      if (lacks(storage, "getChangesSince", context)) return;
      const changes = changesOf(storage);
      await storage.setBatch([["a", item("a", 1)], ["b", item("b", 2)], ["c", item("c", 3)]]);
      const start = await changes();
      await storage.set("a", item("a", 10));
      await storage.delete("b");
      await storage.delete("missing");
      await storage.set("d", item("d", 4));
      const delta = await changes(start.version);
      same(delta.full, false, "full of a delta");
      same(byId(delta.changed), [["a", item("a", 10)], ["d", item("d", 4)]], "changed of a delta");
      same(delta.deleted, ["b"], "deleted of a delta");
      holds(delta.version !== start.version, "the version must change after a write");
    }),
  );

  add("getChangesSince(): a deleted id that comes back is a change, clear() deletes each id, and no write gives no change", (context) =>
    withStorage(create, async (storage) => {
      if (lacks(storage, "getChangesSince", context)) return;
      const changes = changesOf(storage);
      await storage.setBatch([["a", item("a", 1)], ["b", item("b", 2)], ["c", item("c", 3)]]);
      const start = await changes();
      await storage.delete("b");
      await storage.set("b", item("b", 20));
      const back = await changes(start.version);
      same({ full: back.full, changed: byId(back.changed), deleted: back.deleted }, { full: false, changed: [["b", item("b", 20)]], deleted: [] }, "a delete, then a set of the id");

      await storage.clear();
      const cleared = await changes(back.version);
      same({ full: cleared.full, changed: cleared.changed, deleted: [...cleared.deleted].sort() }, { full: false, changed: [], deleted: ["a", "b", "c"] }, "the changes of clear()");
      const quiet = await changes(cleared.version);
      same({ full: quiet.full, changed: quiet.changed, deleted: quiet.deleted }, { full: false, changed: [], deleted: [] }, "the changes without a write");
    }),
  );

  add("getChangesSince() gives every item for an unknown version and for a version of another storage", (context) =>
    withStorage(create, async (storage) => {
      if (lacks(storage, "getChangesSince", context)) return;
      const changes = changesOf(storage);
      await storage.setBatch([["a", item("a", 1)], ["b", item("b", 2)]]);
      await changes();
      for (const unknown of ["not a version", ""]) {
        const result = await changes(unknown);
        same({ full: result.full, changed: byId(result.changed), deleted: result.deleted }, { full: true, changed: [["a", item("a", 1)], ["b", item("b", 2)]], deleted: [] }, `the changes since ${show(unknown)}`);
      }
      await withStorage(create, async (other) => {
        await other.set("x", item("x", 9));
        const foreign = (await changesOf(other)()).version;
        same((await changes(foreign)).full, true, "full for a version of another storage");
      });
    }),
  );

  if (options.createWithMaxTombstones) {
    const withLimit = options.createWithMaxTombstones;
    add("getChangesSince() gives every item for a version older than the deletes that the log dropped", (context) =>
      withStorage(() => withLimit(2), async (storage) => {
        if (lacks(storage, "getChangesSince", context)) return;
        const changes = changesOf(storage);
        await storage.setBatch([["a", item("a", 1)], ["b", item("b", 2)], ["c", item("c", 3)], ["d", item("d", 4)]]);
        const start = await changes();
        // Two deletes fit in the log
        await storage.deleteBatch(["a", "b"]);
        const two = await changes(start.version);
        same({ full: two.full, changed: two.changed, deleted: [...two.deleted].sort() }, { full: false, changed: [], deleted: ["a", "b"] }, "two deletes in a log of two");
        // The third delete drops the oldest one: the start version gives all items now
        await storage.delete("c");
        const after = await changes(start.version);
        same({ full: after.full, changed: byId(after.changed), deleted: after.deleted }, { full: true, changed: [["d", item("d", 4)]], deleted: [] }, "a version older than a dropped delete");
        same((await changes(after.version)).full, false, "a version after the dropped deletes still gives a delta");
      }),
    );
  }

  add("a random sequence of writes agrees with a Map, and each version gives the right changes", () =>
    withStorage(create, async (storage) => {
      const random = seeded(45);
      const pool = ["a", "b", "c", "d", "e", "f", "g"];
      const pick = (): string => pool[random(pool.length)]!;
      const model = new Map<string, ContractItem>();
      const versions: Array<{ version: string; entries: Map<string, ContractItem> }> = [];
      const hasChanges = typeof storage.getChangesSince === "function";
      for (let step = 0; step < 80; step++) {
        const kind = random(20);
        let label: string;
        if (kind < 8) {
          const id = pick();
          const value = item(id, step);
          label = `set(${id})`;
          await storage.set(id, value);
          model.set(id, value);
        } else if (kind < 12) {
          const id = pick();
          label = `delete(${id})`;
          same(await storage.delete(id), model.delete(id), `the result of step ${step}: ${label}`);
        } else if (kind < 15) {
          const batch: Array<[string, ContractItem]> = Array.from({ length: 1 + random(3) }, (_, index) => {
            const id = pick();
            return [id, item(id, step * 10 + index)];
          });
          label = `setBatch(${batch.map(([id]) => id).join(", ")})`;
          await storage.setBatch(batch);
          for (const [id, value] of batch) model.set(id, value);
        } else if (kind < 18) {
          const batch = Array.from({ length: 1 + random(3) }, pick);
          label = `deleteBatch(${batch.join(", ")})`;
          const expected = batch.filter((id) => model.delete(id)).length;
          same(await storage.deleteBatch(batch), expected, `the result of step ${step}: ${label}`);
        } else if (kind < 19) {
          label = "clear()";
          await storage.clear();
          model.clear();
        } else {
          label = "a saved version";
          if (hasChanges) versions.push({ version: (await storage.getChangesSince!()).version, entries: new Map(model) });
        }
        same(await storage.getAll(), [...model.values()], `getAll() after step ${step}: ${label}`);
      }
      same(await storage.size(), model.size, "size() after the sequence");
      if (storage.getEntries) same(await storage.getEntries(), [...model.entries()], "getEntries() after the sequence");
      if (!hasChanges) return;
      holds(versions.length > 0, "the sequence saved no version: change the seed");
      for (const [index, saved] of versions.entries()) {
        const result = await storage.getChangesSince!(saved.version);
        const deleted = new Set(result.deleted);
        holds(result.changed.every(([id]) => !deleted.has(id)), `the changes since version ${index} have an id in changed and in deleted`);
        const rebuilt = result.full ? new Map<string, ContractItem>() : new Map(saved.entries);
        for (const id of result.deleted) rebuilt.delete(id);
        for (const [id, value] of result.changed) rebuilt.set(id, value);
        same(byId([...rebuilt.entries()]), byId([...model.entries()]), `the items of version ${index} with its changes`);
      }
    }),
  );

  add("flush() resolves, and the items stay", (context) =>
    withStorage(create, async (storage) => {
      if (lacks(storage, "flush", context)) return;
      await storage.flush!();
      await storage.set("a", item("a", 1));
      await storage.flush!();
      same(await storage.get("a"), item("a", 1), "get() after flush()");
    }),
  );

  add("getMetadata() gives a known type and the size", (context) =>
    withStorage(create, async (storage) => {
      if (lacks(storage, "getMetadata", context)) return;
      await storage.setBatch([["a", item("a", 1)], ["b", item("b", 2)]]);
      const metadata = await storage.getMetadata!();
      holds(["memory", "api", "hybrid", "synced", "custom"].includes(metadata.type), `getMetadata() gave the unknown type ${show(metadata.type)}`);
      same(metadata.size, 2, "the size of getMetadata()");
    }),
  );

  add("close() resolves, and a second close() resolves too", () =>
    withStorage(create, async (storage) => {
      await storage.set("a", item("a", 1));
      await storage.close();
      await storage.close();
    }),
  );

  return cases;
}

/**
 * This function declares the suite in a test framework: one `describe` with one `it` for each
 * case. Vitest gives `skip` to a case, so a case for a missing optional method shows as skipped.
 */
export function describeCollectionStorageContract(name: string, options: CollectionStorageContractOptions, api: ContractTestApi): void {
  api.describe(`${name} follows the CollectionStorage contract`, () => {
    for (const contractCase of collectionStorageContract(options)) {
      api.it(contractCase.name, (context) => contractCase.run(context));
    }
  });
}
