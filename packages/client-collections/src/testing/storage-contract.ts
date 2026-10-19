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
 *
 * The suite has no option that hides a difference of a storage. Each storage keeps copies, keeps
 * a stored `null`, gives a delta in the order of the last change of each id, and rejects each
 * operation after `close()`.
 *
 * The optional `query()` gives the result of `queryEntries()` of `@procedures/client/query` for the
 * entries of the storage: the reference of the query language. Without a policy, `$regex` is off.
 * With `createWithQueryPolicy`, the suite also tests the opt-in of `$regex` and each limit of a
 * policy. `observe()` gives one batch for each write that changes the storage. `patch()` changes
 * an item in one step, in each of its two forms. A storage without them skips their cases.
 *
 * The preconditions of the writes (roadmap CLI-16): a storage of `create()` cannot test an
 * expected version, so it rejects such a write and changes nothing. With `createWithVersions`, the
 * suite tests `expectedVersion` of `set` and `delete`, `expectedVersions` of `setBatch`, the
 * conflicts and their current items, and two writes at the same time.
 */

import type { CollectionStorage, StorageChangeBatch, StorageChanges } from "../storage/interface.js";
import {
  QUERY_OPERATORS,
  queryEntries,
  versionConflictsOf,
  type StorageQueryOptions,
  type StorageQueryPolicy,
  type StorageSelector,
  type VersionConflict,
} from "@procedures/client/query";
import { holds, rejects, same, show } from "./check.js";

/** The item of the suite. Its `id` is its key, so a `HybridStorage` can sync it. */
export interface ContractItem {
  id: string;
  n: number;
  tags?: string[];
}

/** A storage of the suite. */
export type ContractStorage = CollectionStorage<ContractItem>;

/**
 * The version of an item of the suite: `v` and the field `n`. A storage of `createWithVersions`
 * gives it as its `versionOf` (roadmap CLI-16).
 */
export function contractVersionOf(item: ContractItem): string | undefined {
  return typeof item?.n === "number" ? `v${item.n}` : undefined;
}

/** The options of the suite: the factories of the storage. */
export interface CollectionStorageContractOptions {
  /**
   * This function makes a new, empty storage for each case. The case closes it at its end, also
   * when the case closed it already.
   */
  create(): ContractStorage | Promise<ContractStorage>;
  /**
   * This function makes a new, empty storage whose change log keeps at most `max` deletes. With it,
   * the suite tests the drop of the old deletes. A storage without such a limit does not give it.
   */
  createWithMaxTombstones?: ((max: number) => ContractStorage | Promise<ContractStorage>) | undefined;
  /**
   * This function makes a new, empty storage whose queries follow the policy: the policy of the
   * storage, or of the server of a remote storage. With it, the suite tests the opt-in of `$regex`
   * and each limit of a policy.
   */
  createWithQueryPolicy?: ((policy: StorageQueryPolicy) => ContractStorage | Promise<ContractStorage>) | undefined;
  /**
   * This function makes a new, empty storage that gives each item the version of `versionOf` (the
   * storage of the server for a remote storage). With it, the suite tests the preconditions of
   * the writes (roadmap CLI-16). `versionOf` is `contractVersionOf`.
   */
  createWithVersions?: ((versionOf: (item: ContractItem) => string | undefined) => ContractStorage | Promise<ContractStorage>) | undefined;
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

/** The optional methods of a storage. */
type OptionalMethod = "getEntries" | "getIds" | "getChangesSince" | "flush" | "getMetadata" | "query" | "observe" | "patch";

/** This function skips a case for a storage without an optional method, and gives true. */
function lacks(storage: ContractStorage, method: OptionalMethod, context: ContractTestContext | undefined): boolean {
  if (typeof storage[method] === "function") return false;
  context?.skip?.(`The storage has no ${method}()`);
  return true;
}

/** A storage of JSON values, for the cases of the query language. */
type JsonStorage = CollectionStorage<unknown>;

/** The documents of the cases of the query language, in the order of the entries. */
const DOCUMENTS: ReadonlyArray<[string, unknown]> = [
  ["a", { id: "a", n: 1, tags: ["x"], meta: { kind: "k1", score: 10 }, items: [{ name: "p", qty: 1 }] }],
  ["b", { id: "b", n: 2, tags: ["x", "y"], meta: { kind: "k2" }, items: [{ name: "q", qty: 5 }, { name: "p", qty: 2 }] }],
  ["c", { id: "c", n: 3, tags: [], meta: null }],
  ["d", { id: "d", n: 4, label: "Delta" }],
  ["e", { id: "e", n: "5", tags: ["y"] }],
  ["f", { id: "f", n: null, flag: true }],
  ["g", { id: "g", flag: false, meta: { kind: "k1" } }],
];

/** The selectors of the cases, with the ids that each one matches. */
const SELECTOR_CASES: ReadonlyArray<[StorageSelector, string[]]> = [
  [{}, ["a", "b", "c", "d", "e", "f", "g"]],
  [{ n: 2 }, ["b"]],
  [{ n: { $gt: 1, $lte: 3 } }, ["b", "c"]],
  [{ n: { $gte: "4" } }, ["e"]],
  [{ tags: "x" }, ["a", "b"]],
  [{ tags: ["x", "y"] }, ["b"]],
  [{ "tags.0": "y" }, ["e"]],
  [{ tags: { $size: 0 } }, ["c"]],
  [{ tags: { $all: ["x", "y"] } }, ["b"]],
  [{ tags: { $exists: false } }, ["d", "f", "g"]],
  [{ n: null }, ["f", "g"]],
  [{ n: { $ne: null } }, ["a", "b", "c", "d", "e"]],
  [{ n: { $in: [1, 3, "5"] } }, ["a", "c", "e"]],
  [{ n: { $nin: [1, 3] } }, ["b", "d", "e", "f", "g"]],
  [{ "meta.kind": "k1" }, ["a", "g"]],
  [{ meta: { kind: "k2" } }, ["b"]],
  [{ meta: null }, ["c", "d", "e", "f"]],
  [{ "meta.score": { $lt: 20 } }, ["a"]],
  [{ "items.name": "p" }, ["a", "b"]],
  [{ "items.qty": { $gt: 4 } }, ["b"]],
  [{ "items.1.name": "p" }, ["b"]],
  [{ items: { $elemMatch: { name: "p", qty: { $gte: 2 } } } }, ["b"]],
  [{ tags: { $elemMatch: { $eq: "y" } } }, ["b", "e"]],
  [{ $or: [{ n: 1 }, { flag: true }] }, ["a", "f"]],
  [{ $and: [{ "meta.kind": "k1" }, { flag: false }] }, ["g"]],
  [{ $nor: [{ n: { $exists: true } }, { flag: true }] }, ["g"]],
  [{ n: { $not: { $gt: 2 } } }, ["a", "b", "e", "f", "g"]],
  [{ flag: { $exists: true }, n: null }, ["f", "g"]],
];

/** The selectors with `$regex`, for a policy that permits it, with the ids that each one matches. */
const REGEX_CASES: ReadonlyArray<[StorageSelector, string[]]> = [
  [{ label: { $regex: "^del", $options: "i" } }, ["d"]],
  [{ id: { $regex: "^[ab]$" } }, ["a", "b"]],
  [{ tags: { $regex: "y" } }, ["b", "e"]],
  [{ id: { $not: { $regex: "^[a-e]" } } }, ["f", "g"]],
];

/** A policy that permits `$regex`, with the default limits. */
const REGEX_POLICY: StorageQueryPolicy = { operators: QUERY_OPERATORS };

/** A selector that can take an exponential time: a repetition of a repetition. */
const REDOS: StorageSelector = { label: { $regex: "^(a+)+$" } };

/** The options of the cases, with the ids of the result for the selector `{}`. */
const OPTION_CASES: ReadonlyArray<[StorageQueryOptions, string[]]> = [
  [{ sort: { n: 1 } }, ["f", "g", "a", "b", "c", "d", "e"]],
  [{ sort: { n: -1 } }, ["e", "d", "c", "b", "a", "f", "g"]],
  [{ sort: { "meta.kind": 1, n: -1 } }, ["e", "d", "c", "f", "a", "g", "b"]],
  [{ sort: { tags: 1 } }, ["c", "d", "f", "g", "a", "b", "e"]],
  [{ sort: { tags: -1 } }, ["b", "e", "a", "c", "d", "f", "g"]],
  [{ sort: { n: 1 }, skip: 2, limit: 3 }, ["a", "b", "c"]],
  [{ skip: 5 }, ["f", "g"]],
  [{ limit: 2 }, ["a", "b"]],
  [{ skip: 7 }, []],
];

/** The ids of the entries of a result. */
const entryIds = (entries: ReadonlyArray<readonly [string, unknown]>): string[] => entries.map(([id]) => id);

/** The random parts of the query language, from a seeded random number generator. */
function randomQueries(random: (below: number) => number): {
  selector: (depth: number) => StorageSelector;
  options: () => StorageQueryOptions;
  document: (id: string) => unknown;
} {
  const fields = ["n", "tags", "tags.0", "meta", "meta.kind", "meta.score", "items.name", "items.qty", "flag", "label", "missing"];
  const values: unknown[] = [0, 1, 2, 3, 4, 10, "5", "x", "y", "z", "k1", "k2", "p", "q", true, false, null, ["x"], ["x", "y"], { kind: "k1" }];
  const scalars: unknown[] = [0, 1, 2, 3, 4, 10, "4", "5", "k1", "x", "y", true, false, null];
  const pick = <V>(list: readonly V[]): V => list[random(list.length)]!;
  const operators = (): Record<string, unknown> => {
    switch (random(11)) {
      case 0:
        return { $eq: pick(values) };
      case 1:
        return { $ne: pick(values) };
      case 2:
        return { [pick(["$gt", "$gte", "$lt", "$lte"])]: pick(scalars) };
      case 3:
        return { $in: [pick(values), pick(values)] };
      case 4:
        return { $nin: [pick(values)] };
      case 5:
        return { $exists: random(2) === 0 };
      case 6:
        return { $size: random(3) };
      case 7:
        return { $all: [pick(["x", "y", "z", "p"])] };
      case 8:
        return { $regex: pick(["^k", "1$", "^[a-c]", "Y"]), ...(random(2) === 0 ? { $options: "i" } : {}) };
      case 9:
        return { $elemMatch: random(2) === 0 ? { $gte: pick(["x", "y", 1]) } : { name: pick(["p", "q"]) } };
      default:
        return { $gt: pick(scalars), $lt: pick(scalars) };
    }
  };
  const condition = (): unknown => {
    const kind = random(5);
    if (kind === 0) return pick(values);
    if (kind === 1) return { $not: operators() };
    return operators();
  };
  const selector = (depth: number): StorageSelector => {
    const result: Record<string, unknown> = {};
    for (let count = random(3); count > 0; count--) result[pick(fields)] = condition();
    if (depth > 0 && random(3) === 0) {
      result[pick(["$and", "$or", "$nor"])] = Array.from({ length: 1 + random(2) }, () => selector(depth - 1));
    }
    return result as StorageSelector;
  };
  const options = (): StorageQueryOptions => {
    const result: { sort?: Record<string, 1 | -1>; skip?: number; limit?: number } = {};
    if (random(2) === 0) {
      const sort: Record<string, 1 | -1> = {};
      for (let count = 1 + random(2); count > 0; count--) sort[pick(fields)] = random(2) === 0 ? 1 : -1;
      result.sort = sort;
    }
    if (random(3) === 0) result.skip = random(4);
    if (random(3) === 0) result.limit = 1 + random(5);
    return result;
  };
  const document = (id: string): unknown => {
    const result: Record<string, unknown> = { id };
    if (random(4) !== 0) result["n"] = pick([0, 1, 2, 3, "5", null, true]);
    if (random(3) !== 0) result["tags"] = Array.from({ length: random(3) }, () => pick(["x", "y", "z"]));
    if (random(3) !== 0) result["meta"] = random(4) === 0 ? null : { kind: pick(["k1", "k2"]), ...(random(2) === 0 ? { score: random(20) } : {}) };
    if (random(3) === 0) result["items"] = Array.from({ length: 1 + random(2) }, () => ({ name: pick(["p", "q"]), qty: random(6) }));
    if (random(2) === 0) result["flag"] = random(2) === 0;
    if (random(4) === 0) result["label"] = pick(["Delta", "kilo", "Y"]);
    return result;
  };
  return { selector, options, document };
}

/** The changes of a batch without the keys whose values are undefined, for a comparison. */
function plainBatch(batch: StorageChangeBatch<unknown>): unknown[] {
  return batch.map((change) => Object.fromEntries(Object.entries(change).filter(([, value]) => value !== undefined)));
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
 * with `options.create`. A case for an optional method (`getEntries`, `getIds`, `getChangesSince`,
 * `flush`, `getMetadata`) skips a storage without the method.
 */
export function collectionStorageContract(options: CollectionStorageContractOptions): ContractCase[] {
  const create = (): ContractStorage | Promise<ContractStorage> => options.create();
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
      if (storage.getIds) same(await storage.getIds(), [], "getIds() of an empty storage");
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
      if (storage.getIds) same(await storage.getIds(), ["a", "b", "c"], "getIds() keeps the order of the entries");
    }),
  );

  add("getIds() gives the ids of the entries in their order, as a new array", (context) =>
    withStorage(create, async (storage) => {
      if (lacks(storage, "getIds", context)) return;
      await storage.setBatch([["c", item("c", 3)], ["a", item("a", 1)], ["b", item("b", 2)]]);
      await storage.delete("a");
      await storage.set("a", item("a", 10));
      const first = await storage.getIds!();
      same(first, ["c", "b", "a"], "getIds() after a delete and a new set() of an id");
      first.splice(0);
      same(await storage.getIds!(), ["c", "b", "a"], "getIds() after a change of an earlier result");
      if (storage.getEntries) same(await storage.getIds!(), (await storage.getEntries()).map(([id]) => id), "getIds() and the ids of getEntries()");
      await storage.clear();
      same(await storage.getIds!(), [], "getIds() after clear()");
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

  add("the storage keeps copies: a change of a written or a read value does not change the item", () =>
    withStorage(create, async (storage) => {
      const value = item("a", 1, ["x"]);
      await storage.set("a", value);
      value.n = 99;
      value.tags!.push("changed after set");
      const batch = item("b", 2, ["y"]);
      await storage.setBatch([["b", batch]]);
      batch.tags!.push("changed after setBatch");
      const read = (await storage.get("a"))!;
      same(read, item("a", 1, ["x"]), "get() after a change of the value that set() took");
      same(await storage.get("b"), item("b", 2, ["y"]), "get() after a change of the value that setBatch() took");
      read.n = 98;
      read.tags!.push("changed after get");
      (await storage.getAll())[0]!.n = 97;
      (await storage.getBatch(["a"])).get("a")!.n = 96;
      (await storage.find((found) => {
        found.tags?.push("changed in the predicate");
        return true;
      }))[0]!.n = 95;
      if (storage.getEntries) (await storage.getEntries())[0]![1].n = 94;
      if (storage.getChangesSince) (await storage.getChangesSince()).changed[0]![1].n = 93;
      if (storage.query) (await storage.query({}))[0]![1].n = 92;
      if (storage.patch) {
        const fields = { tags: ["x"] };
        const patched = (await storage.patch("a", fields))!;
        fields.tags.push("changed after patch");
        patched.n = 91;
        patched.tags!.push("changed after patch");
      }
      if (storage.observe) {
        const stop = storage.observe((batch) => {
          for (const change of batch) if (change.type === "set") change.value.tags?.push("changed by an observer");
        });
        await storage.set("c", item("c", 3, ["z"]));
        stop();
        same(await storage.get("c"), item("c", 3, ["z"]), "get() after an observer changed the value of a change");
      }
      same(await storage.get("a"), item("a", 1, ["x"]), "get() after changes of the read values");
      same(await storage.get("b"), item("b", 2, ["y"]), "get() of the other item after changes of the read values");
    }),
  );

  add("the storage keeps JSON values, also null", () =>
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
        ["null", null],
      ];
      await storage.setBatch(values);
      for (const [id, value] of values) same(await storage.get(id), value, `get("${id}")`);
      same(await storage.getAll(), values.map(([, value]) => value), "getAll() of the JSON values");
      same(await storage.getBatch(values.map(([id]) => id)), new Map(values), "getBatch() of the JSON values");
      same(await storage.size(), values.length, "size() with the JSON values");
      same(await storage.has("null"), true, "has() of an id whose value is null");
      await storage.set("single", null);
      same(await storage.get("single"), null, "get() of an id that set() gave the value null");
      same(await storage.get("missing"), undefined, "get() of a missing id, next to a stored null");
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

  add("getChangesSince() without a version gives every item, in the order of the entries", (context) =>
    withStorage(create, async (storage) => {
      if (lacks(storage, "getChangesSince", context)) return;
      const changes = changesOf(storage);
      const entries: Array<[string, ContractItem]> = [["c", item("c", 3)], ["a", item("a", 1)], ["b", item("b", 2)]];
      await storage.setBatch(entries);
      await storage.set("c", item("c", 30));
      const first = await changes();
      holds(typeof first.version === "string" && first.version !== "", `the version must be a text that is not empty, not ${show(first.version)}`);
      same(first.full, true, "full of the first call");
      same(first.changed, [["c", item("c", 30)], ["a", item("a", 1)], ["b", item("b", 2)]], "changed of the first call: every item, in the order of the entries");
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
      same(delta.changed, [["a", item("a", 10)], ["d", item("d", 4)]], "changed of a delta");
      same(delta.deleted, ["b"], "deleted of a delta");
      holds(delta.version !== start.version, "the version must change after a write");
    }),
  );

  add("getChangesSince(version) gives the changes in the order of the last change of each id", (context) =>
    withStorage(create, async (storage) => {
      if (lacks(storage, "getChangesSince", context)) return;
      const changes = changesOf(storage);
      await storage.setBatch([["a", item("a", 1)], ["b", item("b", 2)], ["c", item("c", 3)], ["d", item("d", 4)]]);
      const start = await changes();
      // b changes first, then a. Then b changes again: its last change comes after the change of a.
      await storage.set("b", item("b", 20));
      await storage.set("a", item("a", 10));
      await storage.delete("d");
      await storage.delete("c");
      await storage.setBatch([["e", item("e", 5)], ["b", item("b", 21)]]);
      const delta = await changes(start.version);
      same(
        { changed: delta.changed, deleted: delta.deleted },
        { changed: [["a", item("a", 10)], ["e", item("e", 5)], ["b", item("b", 21)]], deleted: ["d", "c"] },
        "the order of a delta: an id written again after another id comes after it",
      );
      // A delete of d again is not a change. A new set of c moves it from deleted to changed.
      await storage.delete("d");
      await storage.set("c", item("c", 30));
      await storage.deleteBatch(["e", "a"]);
      const next = await changes(delta.version);
      same({ changed: next.changed, deleted: next.deleted }, { changed: [["c", item("c", 30)]], deleted: ["e", "a"] }, "the order of the next delta");
    }),
  );

  add("getChangesSince(): a deleted id that comes back is a change, clear() deletes each id in the order of the entries, and no write gives no change", (context) =>
    withStorage(create, async (storage) => {
      if (lacks(storage, "getChangesSince", context)) return;
      const changes = changesOf(storage);
      await storage.setBatch([["a", item("a", 1)], ["b", item("b", 2)], ["c", item("c", 3)]]);
      const start = await changes();
      await storage.delete("b");
      await storage.set("b", item("b", 20));
      const back = await changes(start.version);
      same({ full: back.full, changed: back.changed, deleted: back.deleted }, { full: false, changed: [["b", item("b", 20)]], deleted: [] }, "a delete, then a set of the id");

      // The entries are a, c, b now: b went to the end at its new set
      await storage.clear();
      const cleared = await changes(back.version);
      same({ full: cleared.full, changed: cleared.changed, deleted: cleared.deleted }, { full: false, changed: [], deleted: ["a", "c", "b"] }, "the changes of clear()");
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
        same({ full: result.full, changed: result.changed, deleted: result.deleted }, { full: true, changed: [["a", item("a", 1)], ["b", item("b", 2)]], deleted: [] }, `the changes since ${show(unknown)}`);
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
        same({ full: two.full, changed: two.changed, deleted: two.deleted }, { full: false, changed: [], deleted: ["a", "b"] }, "two deletes in a log of two");
        // The third delete drops the oldest one: the start version gives all items now
        await storage.delete("c");
        const after = await changes(start.version);
        same({ full: after.full, changed: after.changed, deleted: after.deleted }, { full: true, changed: [["d", item("d", 4)]], deleted: [] }, "a version older than a dropped delete");
        same((await changes(after.version)).full, false, "a version after the dropped deletes still gives a delta");
      }),
    );
  }

  add("a random sequence of writes agrees with a Map, and each version gives the right changes in the right order", () =>
    withStorage(create, async (storage) => {
      const random = seeded(45);
      const pool = ["a", "b", "c", "d", "e", "f", "g"];
      const pick = (): string => pool[random(pool.length)]!;
      const model = new Map<string, ContractItem>();
      // The model of the change log: the number of the last change of each id, oldest first
      const lastChange = new Map<string, { at: number; deleted: boolean }>();
      let clock = 0;
      const note = (id: string, deleted: boolean): void => {
        lastChange.delete(id);
        lastChange.set(id, { at: ++clock, deleted });
      };
      const versions: Array<{ version: string; entries: Map<string, ContractItem>; at: number }> = [];
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
          note(id, false);
        } else if (kind < 12) {
          const id = pick();
          label = `delete(${id})`;
          const existed = model.delete(id);
          if (existed) note(id, true);
          same(await storage.delete(id), existed, `the result of step ${step}: ${label}`);
        } else if (kind < 15) {
          const batch: Array<[string, ContractItem]> = Array.from({ length: 1 + random(3) }, (_, index) => {
            const id = pick();
            return [id, item(id, step * 10 + index)];
          });
          label = `setBatch(${batch.map(([id]) => id).join(", ")})`;
          await storage.setBatch(batch);
          for (const [id, value] of batch) {
            model.set(id, value);
            note(id, false);
          }
        } else if (kind < 18) {
          const batch = Array.from({ length: 1 + random(3) }, pick);
          label = `deleteBatch(${batch.join(", ")})`;
          const expected = batch.filter((id) => {
            const existed = model.delete(id);
            if (existed) note(id, true);
            return existed;
          }).length;
          same(await storage.deleteBatch(batch), expected, `the result of step ${step}: ${label}`);
        } else if (kind < 19) {
          label = "clear()";
          await storage.clear();
          for (const id of model.keys()) note(id, true);
          model.clear();
        } else {
          label = "a saved version";
          if (hasChanges) versions.push({ version: (await storage.getChangesSince!()).version, entries: new Map(model), at: clock });
        }
        same(await storage.getAll(), [...model.values()], `getAll() after step ${step}: ${label}`);
      }
      same(await storage.size(), model.size, "size() after the sequence");
      if (storage.getEntries) same(await storage.getEntries(), [...model.entries()], "getEntries() after the sequence");
      if (storage.getIds) same(await storage.getIds(), [...model.keys()], "getIds() after the sequence");
      if (!hasChanges) return;
      holds(versions.length > 0, "the sequence saved no version: change the seed");
      for (const [index, saved] of versions.entries()) {
        const result = await storage.getChangesSince!(saved.version);
        if (result.full) {
          same(result.changed, [...model.entries()], `the full changes since version ${index}: every item, in the order of the entries`);
          continue;
        }
        // A delta: the changes after the version, in the order of the last change of each id
        const after = [...lastChange].filter(([, change]) => change.at > saved.at);
        const expected = {
          changed: after.filter(([, change]) => !change.deleted).map(([id]): [string, ContractItem] => [id, model.get(id)!]),
          deleted: after.filter(([, change]) => change.deleted).map(([id]) => id),
        };
        same({ changed: result.changed, deleted: result.deleted }, expected, `the changes since version ${index}`);
        const rebuilt = new Map(saved.entries);
        for (const id of result.deleted) rebuilt.delete(id);
        for (const [id, value] of result.changed) rebuilt.set(id, value);
        same(rebuilt, new Map(model), `the items of version ${index} with its changes`);
      }
    }),
  );

  //
  // ═══ query() ═══
  //

  add("query() gives the entries whose items match the selector, in the order of the entries", (context) =>
    withStorage(create, async (typed) => {
      if (lacks(typed, "query", context)) return;
      const storage = typed as unknown as JsonStorage;
      await storage.setBatch([...DOCUMENTS]);
      for (const [selector, expected] of SELECTOR_CASES) {
        const result = await storage.query!(selector);
        same(entryIds(result), expected, `the ids of query(${show(selector)})`);
        same(result, queryEntries(DOCUMENTS, selector), `the entries of query(${show(selector)})`);
      }
    }),
  );

  add("query() sorts, then skips, then limits, and items with equal keys keep the order of the entries", (context) =>
    withStorage(create, async (typed) => {
      if (lacks(typed, "query", context)) return;
      const storage = typed as unknown as JsonStorage;
      await storage.setBatch([...DOCUMENTS]);
      for (const [options, expected] of OPTION_CASES) {
        same(entryIds(await storage.query!({}, options)), expected, `the ids of query({}, ${show(options)})`);
      }
      same(entryIds(await storage.query!({ n: { $exists: true } }, { sort: { n: -1 }, limit: 2 })), ["e", "d"], "a selector with a sort and a limit");
    }),
  );

  add("query() rejects a selector or options that are not correct", (context) =>
    withStorage(create, async (typed) => {
      if (lacks(typed, "query", context)) return;
      const storage = typed as unknown as JsonStorage;
      await storage.setBatch([...DOCUMENTS]);
      const wrong: Array<[unknown, unknown]> = [
        [{ n: { $where: "1" } }, undefined],
        [{ $or: [] }, undefined],
        [{ n: { $gt: 1, x: 2 } }, undefined],
        [{ n: { $regex: "(" } }, undefined],
        [{ n: { $gt: [1] } }, undefined],
        [{ $text: "x" }, undefined],
        [{}, { limit: 0 }],
        [{}, { skip: -1 }],
        [{}, { sort: { n: 2 } }],
        [{}, { fields: { n: 1 } }],
      ];
      for (const [selector, options] of wrong) {
        await rejects(() => storage.query!(selector as StorageSelector, options as StorageQueryOptions), `query(${show(selector)}, ${show(options)})`);
      }
    }),
  );

  const createWithQueryPolicy = options.createWithQueryPolicy;
  const randomPolicy: StorageQueryPolicy | undefined = createWithQueryPolicy ? REGEX_POLICY : undefined;
  add("query() agrees with queryEntries() for random selectors, orders, skips and limits", (context) =>
    withStorage(createWithQueryPolicy ? () => createWithQueryPolicy(REGEX_POLICY) : create, async (typed) => {
      if (lacks(typed, "query", context)) return;
      const storage = typed as unknown as JsonStorage;
      const random = randomQueries(seeded(20));
      const entries: Array<[string, unknown]> = [...DOCUMENTS];
      for (let index = 0; index < 13; index++) entries.push([`r${index}`, random.document(`r${index}`)]);
      await storage.setBatch(entries);
      for (let round = 0; round < 60; round++) {
        const selector = random.selector(2);
        const options = random.options();
        const label = `query(${show(selector)}, ${show(options)})`;
        let expected: Array<[string, unknown]> | undefined;
        try {
          expected = queryEntries(entries, selector, options, randomPolicy);
        } catch {
          expected = undefined;
        }
        if (expected === undefined) await rejects(() => storage.query!(selector, options), label);
        else same(await storage.query!(selector, options), expected, label);
      }
    }),
  );

  add("query() refuses $regex without a policy that permits it, and a pattern that repeats a repetition", (context) =>
    withStorage(create, async (typed) => {
      if (lacks(typed, "query", context)) return;
      const storage = typed as unknown as JsonStorage;
      await storage.setBatch([...DOCUMENTS]);
      for (const [selector] of REGEX_CASES) await rejects(() => storage.query!(selector), `query(${show(selector)}) without a policy`);
      await rejects(() => storage.query!(REDOS), `query(${show(REDOS)}) without a policy`);
    }),
  );

  if (createWithQueryPolicy) {
    add("query() runs $regex under a policy that permits it, and still refuses a pattern that repeats a repetition", (context) =>
      withStorage(() => createWithQueryPolicy(REGEX_POLICY), async (typed) => {
        if (lacks(typed, "query", context)) return;
        const storage = typed as unknown as JsonStorage;
        await storage.setBatch([...DOCUMENTS]);
        for (const [selector, expected] of REGEX_CASES) {
          const result = await storage.query!(selector);
          same(entryIds(result), expected, `the ids of query(${show(selector)})`);
          same(result, queryEntries(DOCUMENTS, selector, {}, REGEX_POLICY), `the entries of query(${show(selector)})`);
        }
        await rejects(() => storage.query!(REDOS), `query(${show(REDOS)}) under a policy with $regex`);
      }),
    );

    add("query() refuses each part that the policy does not permit, and a query without a limit gets maxLimit", (context) =>
      withStorage(
        () =>
          createWithQueryPolicy({
            operators: ["$eq", "$in", "$all", "$and", "$or", "$not", "$regex", "$exists"],
            maxRegexLength: 4,
            regexFlags: "i",
            maxClauses: 4,
            maxDepth: 2,
            maxListLength: 3,
            maxLimit: 3,
          }),
        async (typed) => {
          if (lacks(typed, "query", context)) return;
          const storage = typed as unknown as JsonStorage;
          await storage.setBatch([...DOCUMENTS]);
          const refused: Array<[string, StorageSelector, StorageQueryOptions]> = [
            ["an operator that the policy does not permit", { n: { $gt: 1 } }, {}],
            ["a logical operator that the policy does not permit", { $nor: [{ n: 1 }] }, {}],
            ["a pattern longer than maxRegexLength", { label: { $regex: "^Delt" + "a" } }, {}],
            ["a flag that the policy does not permit", { label: { $regex: "^D", $options: "m" } }, {}],
            ["more clauses than maxClauses", { n: 1, id: "a", flag: true, label: "x", meta: null }, {}],
            ["a selector deeper than maxDepth", { $and: [{ $or: [{ n: { $not: { $eq: 1 } } }] }] }, {}],
            ["a list longer than maxListLength", { n: { $in: [1, 2, 3, 4] } }, {}],
            ["a list of $all longer than maxListLength", { tags: { $all: ["x", "y", "z", "w"] } }, {}],
            ["a limit above maxLimit", {}, { limit: 4 }],
          ];
          for (const [what, selector, query] of refused) {
            await rejects(() => storage.query!(selector, query), `query(${show(selector)}, ${show(query)}): ${what}`);
          }
          const permitted: Array<[StorageSelector, StorageQueryOptions, string[]]> = [
            [{ label: { $regex: "^Del", $options: "i" } }, {}, ["d"]],
            [{ n: { $in: [1, 2, 3] }, flag: { $exists: false } }, {}, ["a", "b", "c"]],
            [{ $and: [{ $or: [{ n: 1 }, { n: 2 }] }] }, {}, ["a", "b"]],
            [{ n: { $not: { $eq: 1 } } }, { limit: 3 }, ["b", "c", "d"]],
            // A query without a limit gets maxLimit
            [{}, {}, ["a", "b", "c"]],
            [{}, { skip: 5 }, ["f", "g"]],
          ];
          for (const [selector, query, expected] of permitted) {
            same(entryIds(await storage.query!(selector, query)), expected, `the ids of query(${show(selector)}, ${show(query)})`);
          }
        },
      ),
    );
  }

  //
  // ═══ patch() ═══
  //

  add("patch() merges the fields into the item, gives the new item, and leaves a missing id missing", (context) =>
    withStorage(create, async (typed) => {
      if (lacks(typed, "patch", context)) return;
      const storage = typed as unknown as JsonStorage;
      await storage.set("a", { id: "a", n: 1, tags: ["x"], meta: { kind: "k1", score: 10 } });
      same(await storage.patch!("a", { n: 2 }), { id: "a", n: 2, tags: ["x"], meta: { kind: "k1", score: 10 } }, "patch() of one field");
      same(await storage.patch!("a", { meta: { score: 11, extra: true }, tags: null }), { id: "a", n: 2, meta: { kind: "k1", score: 11, extra: true } }, "patch() of an object field and a null field");
      same(await storage.patch!("a", { tags: ["y", "z"], meta: { extra: null } }), { id: "a", n: 2, meta: { kind: "k1", score: 11 }, tags: ["y", "z"] }, "patch() of an array field and a nested null");
      same(await storage.get("a"), { id: "a", n: 2, meta: { kind: "k1", score: 11 }, tags: ["y", "z"] }, "get() after the patches");
      same(await storage.patch!("missing", { n: 1 }), undefined, "patch() of a missing id");
      same(await storage.has("missing"), false, "has() of a missing id after patch()");
      same(await storage.size(), 1, "size() after patch() of a missing id");
      await storage.set("plain", 5);
      same(await storage.patch!("plain", { n: 1 }), { n: 1 }, "patch() of an item that is not an object");
      for (const fields of [null, [1], "x", 3]) {
        await rejects(() => storage.patch!("a", fields as never), `patch() with the fields ${show(fields)}`);
      }
      same(await storage.get("a"), { id: "a", n: 2, meta: { kind: "k1", score: 11 }, tags: ["y", "z"] }, "get() after the patches that were not correct");
    }),
  );

  add("patch() with the operations $set and $unset sets null and nested paths, and a patch of two forms rejects", (context) =>
    withStorage(create, async (typed) => {
      if (lacks(typed, "patch", context)) return;
      const storage = typed as unknown as JsonStorage;
      await storage.set("a", { id: "a", n: 1, tags: ["x", "y"], meta: { kind: "k1", score: 10 } });
      same(
        await storage.patch!("a", { $set: { "meta.kind": "k2", note: null, "tags.1": "z", "deep.new.path": 1 }, $unset: ["meta.score"] }),
        { id: "a", n: 1, tags: ["x", "z"], meta: { kind: "k2" }, note: null, deep: { new: { path: 1 } } },
        "patch() with $set and $unset",
      );
      same(
        await storage.patch!("a", { $unset: ["tags.0", "missing.path", "deep"], $set: { "tags.2": "w" } }),
        { id: "a", n: 1, tags: [null, "z", "w"], meta: { kind: "k2" }, note: null },
        "patch() that removes an element of an array, a missing path and a field, and adds an element",
      );
      const after = { id: "a", n: 1, tags: [null, "z", "w"], meta: { kind: "k2" }, note: null };
      const wrong: Array<[string, unknown]> = [
        ["a patch of two forms", { $set: { n: 2 }, n: 3 }],
        ["an operation that is not known", { $inc: { n: 1 } }],
        ["paths that overlap", { $set: { meta: {}, "meta.kind": "k3" } }],
        ["a $set that is not an object", { $set: [1] }],
        ["an $unset that is not a list of paths", { $unset: "n" }],
        ["a path through a value that is not an object", { $set: { "n.x": 1 } }],
        ["a path past the end of an array", { $set: { "tags.7": "v" } }],
      ];
      for (const [what, fields] of wrong) await rejects(() => storage.patch!("a", fields as never), `patch() with ${what}`);
      same(await storage.get("a"), after, "get() after the patches that were not correct");
      same(await storage.patch!("missing", { $set: { n: 1 } }), undefined, "patch() with $set of a missing id");
      same(await storage.has("missing"), false, "has() of a missing id after patch() with $set");
    }),
  );

  add("patch() with $remove and $insert moves the elements of an array, and each index refers to the item before the patch", (context) =>
    withStorage(create, async (typed) => {
      if (lacks(typed, "patch", context)) return;
      const storage = typed as unknown as JsonStorage;
      await storage.set("a", { id: "a", tags: ["a", "b", "c", "d"], rows: [{ n: 1, keys: ["x"] }, { n: 2, keys: ["y"] }], meta: { kind: "k1" } });
      same(
        await storage.patch!("a", { $remove: ["tags.1", "tags.3", "meta.kind"], $insert: { "rows.1.keys.0": "w" } }),
        { id: "a", tags: ["a", "c"], rows: [{ n: 1, keys: ["x"] }, { n: 2, keys: ["w", "y"] }], meta: {} },
        "patch() with $remove and $insert",
      );
      same(
        await storage.patch!("a", { $insert: { "tags.0": "z", "tags.2": "e" }, $remove: ["rows.0", "missing.0"], $set: { "rows.1.n": 3 } }),
        { id: "a", tags: ["z", "a", "c", "e"], rows: [{ n: 3, keys: ["w", "y"] }], meta: {} },
        "patch() that inserts at the start and at the end, and removes a missing path",
      );
      const after = { id: "a", tags: ["z", "a", "c", "e"], rows: [{ n: 3, keys: ["w", "y"] }], meta: {} };
      const wrong: Array<[string, unknown]> = [
        ["a $remove that is not a list of paths", { $remove: "tags" }],
        ["an $insert path that does not end with an index", { $insert: { "meta.kind": 1 } }],
        ["a $remove and an $insert in the same array", { $remove: ["tags.0"], $insert: { "tags.1": "q" } }],
        ["a path under a removed element", { $remove: ["rows.0"], $set: { "rows.0.n": 4 } }],
        ["an $insert past the end of an array", { $insert: { "tags.9": "q" } }],
        ["an $insert into a value that is not an array", { $insert: { "meta.0": "q" } }],
      ];
      for (const [what, fields] of wrong) await rejects(() => storage.patch!("a", fields as never), `patch() with ${what}`);
      same(await storage.get("a"), after, "get() after the patches that were not correct");
    }),
  );

  add("patch() runs in one step: patches of one item at the same time keep each field", (context) =>
    withStorage(create, async (typed) => {
      if (lacks(typed, "patch", context)) return;
      const storage = typed as unknown as JsonStorage;
      await storage.set("a", { id: "a" });
      const count = 12;
      await Promise.all(Array.from({ length: count }, (_, n) => storage.patch!("a", { [`f${n}`]: n })));
      const expected: Record<string, unknown> = { id: "a" };
      for (let n = 0; n < count; n++) expected[`f${n}`] = n;
      same(await storage.get("a"), expected, `get() after ${count} patches at the same time`);
    }),
  );

  add("patch() is a change: getChangesSince() gives the patched item", (context) =>
    withStorage(create, async (storage) => {
      if (lacks(storage, "patch", context) || lacks(storage, "getChangesSince", context)) return;
      await storage.setBatch([["a", item("a", 1)], ["b", item("b", 2)]]);
      const start = await storage.getChangesSince!();
      await storage.patch!("a", { n: 10 });
      await storage.patch!("missing", { n: 3 });
      const delta = await storage.getChangesSince!(start.version);
      same({ full: delta.full, changed: delta.changed, deleted: delta.deleted }, { full: false, changed: [["a", item("a", 10)]], deleted: [] }, "the changes after a patch");
    }),
  );

  //
  // ═══ observe() ═══
  //

  add("observe() gives one batch for each write that changes the storage, before the write resolves", (context) =>
    withStorage(create, async (storage) => {
      if (lacks(storage, "observe", context)) return;
      const batches: unknown[][] = [];
      const stop = storage.observe!((batch) => batches.push(plainBatch(batch)));
      await storage.set("a", item("a", 1));
      same(batches.length, 1, "the batches when set() resolves");
      await storage.setBatch([["b", item("b", 2)], ["c", item("c", 3)]]);
      await storage.delete("a");
      await storage.deleteBatch(["b", "missing"]);
      if (storage.patch) await storage.patch("c", { n: 30 });
      await storage.clear();
      stop();
      same(
        batches,
        [
          [{ type: "set", id: "a", value: item("a", 1) }],
          [
            { type: "set", id: "b", value: item("b", 2) },
            { type: "set", id: "c", value: item("c", 3) },
          ],
          [{ type: "delete", id: "a" }],
          [{ type: "delete", id: "b" }],
          ...(storage.patch ? [[{ type: "set", id: "c", value: item("c", 30) }]] : []),
          [{ type: "clear" }],
        ],
        "the batches of the writes",
      );
    }),
  );

  add("observe(): a write that changes nothing gives no batch, and each change has the origin of its write", (context) =>
    withStorage(create, async (storage) => {
      if (lacks(storage, "observe", context)) return;
      const batches: unknown[][] = [];
      const stop = storage.observe!((batch) => batches.push(plainBatch(batch)));
      await storage.delete("missing");
      await storage.deleteBatch(["missing"]);
      await storage.deleteBatch([]);
      await storage.setBatch([]);
      await storage.clear();
      if (storage.patch) await storage.patch("missing", { n: 1 });
      same(batches, [], "the batches of the writes that change nothing");
      await storage.set("a", item("a", 1), { origin: "sync" });
      await storage.setBatch([["b", item("b", 2)]], { origin: "app" });
      await storage.delete("a", { origin: "sync" });
      await storage.deleteBatch(["b"], { origin: "app" });
      await storage.set("c", item("c", 3), {});
      await storage.clear({ origin: "reset" });
      stop();
      same(
        batches,
        [
          [{ type: "set", id: "a", value: item("a", 1), origin: "sync" }],
          [{ type: "set", id: "b", value: item("b", 2), origin: "app" }],
          [{ type: "delete", id: "a", origin: "sync" }],
          [{ type: "delete", id: "b", origin: "app" }],
          [{ type: "set", id: "c", value: item("c", 3) }],
          [{ type: "clear", origin: "reset" }],
        ],
        "the batches with their origins",
      );
    }),
  );

  add("observe(): each observer gets each batch, and the function that observe() gives stops the batches", (context) =>
    withStorage(create, async (storage) => {
      if (lacks(storage, "observe", context)) return;
      const first: string[] = [];
      const second: string[] = [];
      const stopFirst = storage.observe!((batch) => first.push(...batch.map((change) => change.type)));
      const stopSecond = storage.observe!((batch) => second.push(...batch.map((change) => change.type)));
      await storage.set("a", item("a", 1));
      stopFirst();
      stopFirst();
      await storage.delete("a");
      stopSecond();
      await storage.set("b", item("b", 2));
      same(first, ["set"], "the changes of the first observer");
      same(second, ["set", "delete"], "the changes of the second observer");
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

  add("after close(), each operation rejects with an error that says that the storage is closed, and a second close() does nothing", () =>
    withStorage(create, async (storage) => {
      await storage.set("a", item("a", 1));
      await storage.close();
      const operations: Array<[string, () => Promise<unknown>]> = [
        ["get", () => storage.get("a")],
        ["getAll", () => storage.getAll()],
        ["find", () => storage.find(() => true)],
        ["has", () => storage.has("a")],
        ["size", () => storage.size()],
        ["getBatch", () => storage.getBatch(["a"])],
        ["getBatch of no id", () => storage.getBatch([])],
        ["set", () => storage.set("b", item("b", 2))],
        ["delete", () => storage.delete("a")],
        ["clear", () => storage.clear()],
        ["setBatch", () => storage.setBatch([["b", item("b", 2)]])],
        ["setBatch of no item", () => storage.setBatch([])],
        ["deleteBatch", () => storage.deleteBatch(["a"])],
        ["deleteBatch of no id", () => storage.deleteBatch([])],
      ];
      if (storage.getEntries) operations.push(["getEntries", () => storage.getEntries!()]);
      if (storage.getIds) operations.push(["getIds", () => storage.getIds!()]);
      if (storage.getChangesSince) operations.push(["getChangesSince", () => storage.getChangesSince!()]);
      if (storage.flush) operations.push(["flush", () => storage.flush!()]);
      if (storage.getMetadata) operations.push(["getMetadata", () => storage.getMetadata!()]);
      if (storage.query) operations.push(["query", () => storage.query!({})]);
      if (storage.patch) operations.push(["patch", () => storage.patch!("a", { n: 2 })]);
      const check = async (when: string): Promise<void> => {
        for (const [name, start] of operations) {
          const error = await rejects(start, `${name}() ${when}`);
          holds(
            error instanceof Error && /closed/i.test(error.message),
            `${name}() ${when} must reject with an Error whose message says "closed", not ${show(error instanceof Error ? error.message : error)}`,
          );
        }
      };
      const checkObserve = (when: string): void => {
        if (!storage.observe) return;
        let error: unknown;
        try {
          storage.observe(() => undefined);
        } catch (thrown) {
          error = thrown;
        }
        holds(error instanceof Error && /closed/i.test(error.message), `observe() ${when} must throw an Error whose message says "closed", not ${show(error instanceof Error ? error.message : error)}`);
      };
      await check("after close()");
      checkObserve("after close()");
      // A second close() resolves, and the storage stays closed
      await storage.close();
      await check("after a second close()");
      checkObserve("after a second close()");
    }),
  );

  addPreconditionCases(add, create, options.createWithVersions);

  return cases;
}

/**
 * This function gives the conflicts of a rejected write with a precondition. It checks the code
 * `VERSION_CONFLICT` first.
 */
function conflictsOfRejection(error: unknown, what: string): readonly VersionConflict[] {
  const code = (error as { code?: unknown } | null)?.code;
  holds(code === "VERSION_CONFLICT", `${what}: the error must have the code VERSION_CONFLICT, not ${show(code)} (${show(error instanceof Error ? error.message : error)})`);
  const conflicts = versionConflictsOf(error);
  holds(conflicts !== undefined, `${what}: the error must have its conflicts`);
  return conflicts!;
}

/** The cases of the preconditions of the writes (roadmap CLI-16). */
function addPreconditionCases(
  add: (name: string, run: (context?: ContractTestContext) => Promise<void>) => void,
  create: () => ContractStorage | Promise<ContractStorage>,
  createWithVersions: CollectionStorageContractOptions["createWithVersions"],
): void {
  add("a storage that cannot test an expected version rejects the write, and changes nothing", () =>
    withStorage(create, async (storage) => {
      await storage.set("a", item("a", 1));
      await rejects(() => storage.set("a", item("a", 2), { expectedVersion: "v1" }), "set() with expectedVersion on a storage without versions");
      await rejects(() => storage.delete("a", { expectedVersion: "v1" }), "delete() with expectedVersion on a storage without versions");
      await rejects(() => storage.setBatch([["a", item("a", 3)]], { expectedVersions: [["a", "v1"]] }), "setBatch() with expectedVersions on a storage without versions");
      same(await storage.get("a"), item("a", 1), "the item after the refused writes");
      // A write without a precondition is the write of before
      await storage.set("a", item("a", 4));
      same(await storage.get("a"), item("a", 4), "a write without expectedVersion");
    }),
  );

  if (!createWithVersions) return;
  const versioned = (): ContractStorage | Promise<ContractStorage> => createWithVersions(contractVersionOf);

  add("a write with the expected version of the current item writes, and a write without one writes as before", () =>
    withStorage(versioned, async (storage) => {
      await storage.set("a", item("a", 1));
      await storage.set("a", item("a", 2), { expectedVersion: "v1" });
      same(await storage.get("a"), item("a", 2), "the item after set() with the expected version");
      await storage.set("a", item("a", 3));
      same(await storage.get("a"), item("a", 3), "the item after set() without expectedVersion");
      same(await storage.delete("a", { expectedVersion: "v3" }), true, "delete() with the expected version");
      same(await storage.get("a"), undefined, "the item after delete() with the expected version");
    }),
  );

  add("a write with another expected version changes nothing, and rejects with VERSION_CONFLICT and the current item", () =>
    withStorage(versioned, async (storage) => {
      await storage.set("a", item("a", 1));
      let batches = 0;
      const stop = storage.observe?.(() => {
        batches++;
      });
      const before = storage.getChangesSince ? (await storage.getChangesSince()).version : undefined;
      const expected: VersionConflict = { id: "a", expected: "v2", found: true, value: item("a", 1), version: "v1" };
      const setError = await rejects(() => storage.set("a", item("a", 3), { expectedVersion: "v2" }), "set() with a stale version");
      same(conflictsOfRejection(setError, "set() with a stale version"), [expected], "the conflicts of set() with a stale version");
      const deleteError = await rejects(() => storage.delete("a", { expectedVersion: "v2" }), "delete() with a stale version");
      same(conflictsOfRejection(deleteError, "delete() with a stale version"), [expected], "the conflicts of delete() with a stale version");
      same(await storage.get("a"), item("a", 1), "the item after the refused writes");
      stop?.();
      same(batches, 0, "the batches of observe() for the refused writes");
      if (storage.getChangesSince && before !== undefined) {
        const after = await storage.getChangesSince(before);
        same({ changed: after.changed, deleted: after.deleted }, { changed: [], deleted: [] }, "the changes after the refused writes");
      }
    }),
  );

  add("the expected version null expects no item", () =>
    withStorage(versioned, async (storage) => {
      await storage.set("b", item("b", 1), { expectedVersion: null });
      same(await storage.get("b"), item("b", 1), "set() with expectedVersion null of a missing id");
      const exists = await rejects(() => storage.set("b", item("b", 2), { expectedVersion: null }), "set() with expectedVersion null of an existing id");
      same(conflictsOfRejection(exists, "set() with expectedVersion null of an existing id"), [{ id: "b", expected: null, found: true, value: item("b", 1), version: "v1" }], "the conflict of an existing id");
      const missing = await rejects(() => storage.set("c", item("c", 1), { expectedVersion: "v1" }), "set() with a version of a missing id");
      same(conflictsOfRejection(missing, "set() with a version of a missing id"), [{ id: "c", expected: "v1", found: false, version: null }], "the conflict of a missing id");
      same(await storage.has("c"), false, "the missing id after the refused set()");
      same(await storage.delete("x", { expectedVersion: null }), false, "delete() with expectedVersion null of a missing id");
    }),
  );

  add("setBatch() tests the expected version of each id, and a conflict changes no item", () =>
    withStorage(versioned, async (storage) => {
      await storage.setBatch([["a", item("a", 1)], ["b", item("b", 1)]]);
      const error = await rejects(
        () => storage.setBatch([["a", item("a", 2)], ["b", item("b", 2)], ["c", item("c", 1)]], { expectedVersions: [["a", "v1"], ["b", "v9"]] }),
        "setBatch() with one stale version",
      );
      same(conflictsOfRejection(error, "setBatch() with one stale version"), [{ id: "b", expected: "v9", found: true, value: item("b", 1), version: "v1" }], "the conflicts of setBatch()");
      same(await storage.getBatch(["a", "b", "c"]), new Map([["a", item("a", 1)], ["b", item("b", 1)]]), "the items after the refused batch");
      // An id without an expected version has no precondition
      await storage.setBatch([["a", item("a", 2)], ["b", item("b", 2)], ["c", item("c", 1)]], { expectedVersions: [["a", "v1"], ["b", "v1"]] });
      same(await storage.getBatch(["a", "b", "c"]), new Map([["a", item("a", 2)], ["b", item("b", 2)], ["c", item("c", 1)]]), "the items after the batch");
    }),
  );

  add("two writes with the same expected version at the same time: one writes, and the other gets VERSION_CONFLICT", () =>
    withStorage(versioned, async (storage) => {
      await storage.set("a", item("a", 1));
      const results = await Promise.allSettled([
        storage.set("a", item("a", 2), { expectedVersion: "v1" }),
        storage.set("a", item("a", 3), { expectedVersion: "v1" }),
      ]);
      const won = results.flatMap((result, index) => (result.status === "fulfilled" ? [index] : []));
      same(won.length, 1, "the number of writes that won");
      const lost = results.find((result): result is PromiseRejectedResult => result.status === "rejected")!;
      const conflicts = conflictsOfRejection(lost.reason, "the write that lost");
      same(conflicts.map((conflict) => conflict.id), ["a"], "the conflict of the write that lost");
      same(await storage.get("a"), item("a", won[0] === 0 ? 2 : 3), "the item of the write that won");
    }),
  );
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
