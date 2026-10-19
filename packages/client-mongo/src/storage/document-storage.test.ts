/**
 * `MongoDocumentStorage` (roadmap CLI-24). The contract of `CollectionStorage`, the partitions, the
 * documents and the change log run against a real MongoDB: set `MONGO_TEST_URL` (CI starts a
 * `mongo:7` service). The filter of the queries is pure, so its tests always run.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ms } from "@procedures/client";
import { MongoClient, type Db } from "mongodb";
import { queryEntries, type StorageSelector } from "@procedures/collections";
import { describeCollectionStorageContract, type ContractItem } from "@procedures/collections/testing";
import { MongoDocumentStorage, selectorPrefilter, type MongoDocumentStorageOptions } from "./document-storage.js";

describe("selectorPrefilter: the conditions that MongoDB tests in the same way", () => {
  it("sends the equality of a string, a number and a boolean, and $eq and $in of them", () => {
    expect(selectorPrefilter({ kind: "note", n: 2, done: false })).toEqual({ $and: [{ kind: "note" }, { n: 2 }, { done: false }] });
    expect(selectorPrefilter({ n: { $eq: 1, $in: [1, 2], $gt: 0 } })).toEqual({ n: { $eq: 1, $in: [1, 2] } });
    expect(selectorPrefilter({ "meta.kind": "x" })).toEqual({ "meta.kind": "x" });
  });

  it("maps _id to the stored id field, and leaves out the fields of the storage", () => {
    expect(selectorPrefilter({ _id: "a" })).toEqual({ _key: "a" });
    expect(selectorPrefilter({ _id: { $in: ["a", "b"] } })).toEqual({ _key: { $in: ["a", "b"] } });
    expect(selectorPrefilter({ "_id.x": 1, _seq: 1, _json: "x", _part: "p" })).toBeUndefined();
  });

  it("leaves out each condition that MongoDB tests in another way", () => {
    // The order of types, null and a missing field, objects, arrays, regular expressions, negations
    expect(selectorPrefilter({ n: { $gt: 1 } })).toBeUndefined();
    expect(selectorPrefilter({ n: null })).toBeUndefined();
    expect(selectorPrefilter({ o: { a: 1 } })).toBeUndefined();
    expect(selectorPrefilter({ tags: ["a"] })).toBeUndefined();
    expect(selectorPrefilter({ n: { $in: [1, null] } })).toBeUndefined();
    expect(selectorPrefilter({ n: { $in: [] } })).toBeUndefined();
    expect(selectorPrefilter({ $nor: [{ n: 1 }] })).toBeUndefined();
    expect(selectorPrefilter({ n: Number.NaN })).toBeUndefined();
  });

  it("keeps $and branches, and an $or only when each branch has a condition", () => {
    expect(selectorPrefilter({ $and: [{ a: 1 }, { b: { $gt: 1 } }] })).toEqual({ a: 1 });
    expect(selectorPrefilter({ $or: [{ a: 1 }, { b: "x" }] })).toEqual({ $or: [{ a: 1 }, { b: "x" }] });
    expect(selectorPrefilter({ $or: [{ a: 1 }, { b: { $gt: 1 } }] })).toBeUndefined();
    expect(selectorPrefilter({})).toBeUndefined();
  });

  it("passes each item that the reference matches (500 random selectors over random items)", () => {
    let seed = 3;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;
    const values = [0, 1, 2, "a", "b", true, false, null, [1, "a"], { x: 1 }];
    const item = () => {
      const out: Record<string, unknown> = {};
      for (const key of ["n", "s", "t"]) if (rand() < 0.8) out[key] = pick(values);
      if (rand() < 0.3) out["m"] = { k: pick(values) };
      return out;
    };
    const condition = (): unknown => {
      const r = rand();
      if (r < 0.4) return pick(values);
      if (r < 0.6) return { $eq: pick(values) };
      if (r < 0.8) return { $in: [pick(values), pick(values)] };
      return { $gt: pick(values) };
    };
    const selector = (depth: number): StorageSelector => {
      const out: Record<string, unknown> = {};
      for (const key of ["n", "s", "t", "m.k"]) if (rand() < 0.4) out[key] = condition();
      if (depth < 1 && rand() < 0.3) out["$or"] = [selector(depth + 1), selector(depth + 1)];
      return out as StorageSelector;
    };
    /** The prefilter as a predicate: the subset of MongoDB's semantics that the filter uses. */
    const passes = (filter: Record<string, unknown> | undefined, doc: Record<string, unknown>): boolean => {
      if (!filter) return true;
      return Object.entries(filter).every(([key, cond]) => {
        if (key === "$and") return (cond as Record<string, unknown>[]).every((branch) => passes(branch, doc));
        if (key === "$or") return (cond as Record<string, unknown>[]).some((branch) => passes(branch, doc));
        const found = key.split(".").reduce<unknown>((value, part) => (value && typeof value === "object" ? (value as Record<string, unknown>)[part] : undefined), doc);
        const candidates = Array.isArray(found) ? [found, ...found] : [found];
        const ops = typeof cond === "object" && cond !== null ? (cond as Record<string, unknown>) : { $eq: cond };
        return Object.entries(ops).every(([op, operand]) =>
          op === "$eq" ? candidates.some((c) => c === operand) : (operand as unknown[]).some((o) => candidates.some((c) => c === o)),
        );
      });
    };
    for (let n = 0; n < 500; n++) {
      const items = Array.from({ length: 8 }, (_, i): [string, Record<string, unknown>] => [`i${i}`, item()]);
      const sel = selector(0);
      let matched: Array<[string, unknown]>;
      try {
        matched = queryEntries(items, sel);
      } catch {
        continue; // a selector that the language refuses
      }
      const filter = selectorPrefilter(sel);
      for (const [, value] of matched) expect(passes(filter, value as Record<string, unknown>), JSON.stringify({ sel, value })).toBe(true);
    }
  });
});

const url = process.env["MONGO_TEST_URL"];
const withMongo = url ? describe : describe.skip;

let client: MongoClient | undefined;
let db: Db;
let next = 0;

beforeAll(async () => {
  if (!url) return;
  client = new MongoClient(url);
  await client.connect();
  db = client.db(`client_mongo_test_${process.pid}_${Date.now()}`);
});

afterAll(async () => {
  if (!client) return;
  await db.dropDatabase();
  await client.close();
});

/**
 * A new storage on a new collection of the test database. With the client, a write is a
 * transaction on a replica set; on a single server, it uses the watermark.
 */
function fresh<T = ContractItem>(options: Partial<MongoDocumentStorageOptions> = {}): MongoDocumentStorage<T> {
  return new MongoDocumentStorage<T>({ collection: `c${++next}`, db: () => db, client: () => client!, ...options });
}

/** True when the test database is on a replica set: it has transactions. */
async function onReplicaSet(): Promise<boolean> {
  const hello = await db.admin().command({ hello: 1 });
  return typeof hello["setName"] === "string";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describeCollectionStorageContract(
  "MongoDocumentStorage",
  {
    create: () => fresh(),
    createWithMaxTombstones: (max) => fresh({ maxTombstones: max }),
    createWithQueryPolicy: (policy) => fresh({ queryPolicy: policy }),
  },
  { describe: withMongo, it },
);

describeCollectionStorageContract(
  "MongoDocumentStorage with a partition",
  {
    create: () => fresh({ partition: "t1" }),
    createWithMaxTombstones: (max) => fresh({ partition: "t1", maxTombstones: max }),
    createWithQueryPolicy: (policy) => fresh({ partition: "t1", queryPolicy: policy }),
  },
  { describe: withMongo, it },
);

withMongo("MongoDocumentStorage on MongoDB", () => {
  it("keeps the partitions of one collection apart, with the same ids", async () => {
    const root = fresh<{ text: string }>();
    const ann = root.forPartition("t1");
    const bob = root.forPartition("t2");
    expect(root.forPartition("t1")).toBe(ann);
    await ann.set("n1", { text: "ann's" });
    await bob.set("n1", { text: "bob's" });
    await root.set("n1", { text: "no partition" });
    expect(await ann.get("n1")).toEqual({ text: "ann's" });
    expect(await bob.getAll()).toEqual([{ text: "bob's" }]);
    expect(await root.getIds()).toEqual(["n1"]);
    expect(await ann.query({ text: "bob's" })).toEqual([]);
    await bob.clear();
    expect(await ann.size()).toBe(1);
    expect(await root.size()).toBe(1);
    const changes = await ann.getChangesSince();
    expect(changes.changed).toEqual([["n1", { text: "ann's" }]]);
  });

  it("stores a plain object flat and another item as JSON, and gives each back", async () => {
    const storage = fresh<unknown>({ collection: "formats" });
    const items: Array<[string, unknown]> = [
      ["flat", { title: "a", n: 1, nested: { x: [1, { y: 2 }] } }],
      ["null", null],
      ["text", "hello"],
      ["list", [1, 2]],
      ["dollar", { $set: 1 }],
      ["dotted", { "a.b": 1 }],
      ["reserved", { _seq: 5 }],
      ["own-id", { _id: "own-id", kind: "x" }],
      ["other-id", { _id: "something-else" }],
      ["proto", JSON.parse('{"__proto__":{"isAdmin":true},"a":1}')],
    ];
    await storage.setBatch(items);
    for (const [id, value] of items) expect(await storage.get(id), id).toEqual(value);
    const raw = await db.collection("formats").find({}).toArray();
    const byKey = new Map(raw.map((doc) => [doc["_key"], doc]));
    expect(byKey.get("flat")).toMatchObject({ title: "a", n: 1, _seq: 1, _ord: 1 });
    expect(byKey.get("flat")?.["_json"]).toBeUndefined();
    expect(byKey.get("own-id")).toMatchObject({ _id: "own-id", _kid: true, kind: "x" });
    for (const id of ["null", "text", "list", "dollar", "dotted", "reserved", "other-id", "proto"]) expect(typeof byKey.get(id)?.["_json"], id).toBe("string");
    const proto = (await storage.get("proto")) as Record<string, unknown>;
    expect(Object.getPrototypeOf(proto)).toBe(Object.prototype);
    expect(proto["isAdmin"]).toBeUndefined();
    // A query reads the JSON items too
    expect((await storage.query({ _id: "own-id" })).map(([id]) => id)).toEqual(["own-id"]);
    expect((await storage.query({ a: 1 })).map(([id]) => id)).toEqual(["proto"]);
  });

  it("gives the version of an item: the number of its last write", async () => {
    const storage = fresh<{ n: number }>();
    await storage.set("a", { n: 1 });
    const first = await storage.versionOf("a");
    await storage.set("a", { n: 2 });
    const second = await storage.versionOf("a");
    expect(Number(second)).toBeGreaterThan(Number(first));
    expect(await storage.versionOf("missing")).toBeUndefined();
    await storage.delete("a");
    expect(await storage.versionOf("a")).toBeUndefined();
  });

  it("gives a full result for a version of another epoch, and a delta after a version of this one", async () => {
    const storage = fresh<{ n: number }>();
    await storage.set("a", { n: 1 });
    const { version } = await storage.getChangesSince();
    await storage.set("b", { n: 2 });
    await storage.delete("a");
    expect(await storage.getChangesSince(version)).toMatchObject({ full: false, changed: [["b", { n: 2 }]], deleted: ["a"] });
    expect((await storage.getChangesSince("other-epoch.1")).full).toBe(true);
    expect((await storage.getChangesSince("not a version")).full).toBe(true);
  });

  it("keeps the order of the numbers under writes at the same time", async () => {
    const storage = fresh<{ n: number }>();
    const { version } = await storage.getChangesSince();
    await Promise.all(Array.from({ length: 30 }, (_, i) => storage.set(`k${i % 10}`, { n: i })));
    const changes = await storage.getChangesSince(version);
    expect(changes.full).toBe(false);
    expect(changes.changed).toHaveLength(10);
    // Each id has its last value, and the order is the order of the last writes
    expect(changes.changed.map(([id]) => id)).toEqual(Array.from({ length: 10 }, (_, i) => `k${i}`));
    expect(changes.changed.map(([, value]) => value.n)).toEqual(Array.from({ length: 10 }, (_, i) => 20 + i));
  });

  it("refuses an id with the separator, in each operation", async () => {
    const storage = fresh<{ n: number }>();
    const bad = "t1x";
    await expect(storage.set(bad, { n: 1 })).rejects.toThrow(/U\+001F/);
    await expect(storage.setBatch([["ok", { n: 1 }], [bad, { n: 2 }]])).rejects.toThrow(/U\+001F/);
    await expect(storage.get(bad)).rejects.toThrow(/U\+001F/);
    await expect(storage.delete(bad)).rejects.toThrow(/U\+001F/);
    await expect(storage.patch(bad, { n: 3 })).rejects.toThrow(/U\+001F/);
    expect(await storage.size()).toBe(0); // the batch with a bad id wrote nothing
  });

  it("cannot take over a stored document of another partition", async () => {
    const name = `c${++next}`;
    // A document of the partition t9 whose stored _id has no prefix, as an older format could have
    await db.collection(name).insertOne({ _id: "y" as never, _key: "y", _part: "t9", _seq: 1, _ord: 1, n: 1 });
    const root = fresh<{ n: number }>({ collection: name });
    expect(await root.get("y")).toBeUndefined();
    await expect(root.set("y", { n: 2 })).rejects.toThrow();
    await expect(root.delete("y")).resolves.toBe(false);
    expect(await db.collection(name).findOne({ _id: "y" as never })).toMatchObject({ _part: "t9", n: 1 });
  });

  it("keeps the log exact across processes: a version stops below a number that another process has not written", async () => {
    const name = `c${++next}`;
    const storage = fresh<{ n: number }>({ collection: name });
    await storage.set("a", { n: 1 });
    const first = await storage.getChangesSince();
    // Another process takes the next number, and its write is not visible yet
    const counters = db.collection<{ _id: string; seq: number }>("__storage_counters");
    const taken = await counters.findOneAndUpdate(
      { _id: name },
      [
        { $set: { seq: { $add: ["$seq", 1] } } },
        { $set: { pending: { $concatArrays: [{ $ifNull: ["$pending", []] }, [{ from: "$seq", to: "$seq", at: "$$NOW" }]] } } },
      ],
      { returnDocument: "after" },
    );
    const theirs = taken!.seq;
    await storage.set("b", { n: 2 }); // the number after theirs
    const held = await storage.getChangesSince(first.version);
    expect(held).toMatchObject({ full: false, changed: [], deleted: [] });
    expect(held.version).toBe(first.version);
    // The other process writes, and ends its number
    await db.collection(name).insertOne({ _id: "c" as never, _key: "c", _seq: theirs, _ord: theirs, n: 3 });
    await counters.updateOne({ _id: name }, { $pull: { pending: { from: theirs } } } as never);
    const after = await storage.getChangesSince(held.version);
    expect(after.changed.map(([id]) => id)).toEqual(["c", "b"]);
  });

  it("does not wait for a pending number whose lease has ended", async () => {
    const name = `c${++next}`;
    const storage = fresh<{ n: number }>({ collection: name, writeLease: ms(1000) });
    await storage.set("a", { n: 1 });
    const first = await storage.getChangesSince();
    const counters = db.collection<{ _id: string; seq: number }>("__storage_counters");
    await counters.updateOne({ _id: name }, [
      { $set: { seq: { $add: ["$seq", 1] } } },
      { $set: { pending: { $concatArrays: [{ $ifNull: ["$pending", []] }, [{ from: "$seq", to: "$seq", at: new Date(0) }]] } } },
    ]);
    await storage.set("b", { n: 2 });
    expect((await storage.getChangesSince(first.version)).changed.map(([id]) => id)).toEqual(["b"]);
  });

  it("on a single server, a write that ends after its lease moves its documents to new numbers, so a reader that passed them gets it", async () => {
    const name = `c${++next}`;
    const lease = 50;
    // The writes of this storage stall past the lease, as a slow process does (another database
    // object: another queue of writes, as in another process). The stall is a gate that the test
    // opens, not a time: the order of the steps is the same on a slow machine (CLI-53). The lease
    // is the time of the server ($$NOW), so the test still waits past it, from a known start.
    let reached!: () => void;
    const atWrite = new Promise<void>((resolve) => (reached = resolve));
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    const slowDb = new Proxy(db, {
      get(target, prop) {
        if (prop === "collection") {
          return (collectionName: string) => {
            const real = target.collection(collectionName);
            if (collectionName !== name) return real;
            return new Proxy(real, {
              get(collection, key) {
                const value = Reflect.get(collection, key, collection) as unknown;
                if (key === "bulkWrite") return async (...args: unknown[]) => (reached(), await gate, (value as (...a: unknown[]) => unknown).apply(collection, args));
                return typeof value === "function" ? value.bind(collection) : value;
              },
            });
          };
        }
        const value = Reflect.get(target, prop, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const slow = new MongoDocumentStorage<{ n: number }>({ collection: name, db: () => slowDb, transactions: "never", writeLease: ms(lease) });
    const fast = fresh<{ n: number }>({ collection: name, transactions: "never", writeLease: ms(lease) });
    await fast.set("a", { n: 1 });
    const start = await fast.getChangesSince();
    const late = slow.set("late", { n: 2 });
    // The slow write has its pending number (it reaches its write after the number), and it waits at
    // the gate. A wait of more than the lease from here ends the lease on the server, also when the
    // machine is slow: a longer wait only makes it surer.
    let passed: Awaited<ReturnType<typeof fast.getChangesSince>>;
    try {
      await atWrite;
      await sleep(lease * 3);
      await fast.set("b", { n: 3 });
      // The lease of the slow write ended: the watermark passed its number, and its write waits still
      passed = await fast.getChangesSince(start.version);
      expect(passed.changed.map(([id]) => id)).toEqual(["b"]);
    } finally {
      open(); // a failed step never leaves the slow write at the gate
    }
    await late;
    const after = await fast.getChangesSince(passed.version);
    expect(after.changed.map(([id]) => id)).toEqual(["late"]);
    expect(Number(await fast.versionOf("late"))).toBeGreaterThan(Number(await fast.versionOf("b")));
  });

  it("does not move a write that ends in its lease", async () => {
    const storage = fresh<{ n: number }>({ transactions: "never" });
    await storage.set("a", { n: 1 });
    const first = await storage.versionOf("a");
    await storage.set("b", { n: 2 });
    expect(Number(await storage.versionOf("b"))).toBe(Number(first) + 1);
  });

  it("on a replica set, a write is one transaction with its numbers, and leaves no pending numbers", async (context) => {
    if (!(await onReplicaSet())) {
      // The replica-set job of CI must run this test: a skip there would hide the path of the transactions
      if (process.env["MONGO_TEST_TOPOLOGY"] === "replica-set") throw new Error("MONGO_TEST_TOPOLOGY is replica-set, but the test database is a single server");
      return context.skip?.("the test database is a single server");
    }
    let sessions = 0;
    const counted = new Proxy(client!, {
      get(target, prop) {
        if (prop === "startSession") return (...args: unknown[]) => (sessions++, (target.startSession as (...a: unknown[]) => unknown).apply(target, args));
        const value = Reflect.get(target, prop, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const name = `c${++next}`;
    const storage = fresh<{ n: number }>({ collection: name, client: () => counted });
    await Promise.all([storage.set("a", { n: 1 }), storage.setBatch([["b", { n: 2 }], ["c", { n: 3 }]]), storage.delete("x")]);
    await storage.patch("a", { n: 9 });
    expect(sessions).toBe(3);
    const counter = await db.collection<{ _id: string; pending?: unknown[] }>("__storage_counters").findOne({ _id: name });
    expect(counter?.pending ?? []).toEqual([]);
    expect((await storage.getChangesSince()).changed.map(([id]) => id).sort()).toEqual(["a", "b", "c"]);
  });

  it("aggregates the items of its partition only: no tombstones, a $lookup in the partition, and the limits", async () => {
    const name = `c${++next}`;
    const root = fresh<{ kind: string; n: number }>({ collection: name });
    const ann = root.forPartition("t1");
    const bob = root.forPartition("t2");
    await ann.setBatch([["a", { kind: "x", n: 1 }], ["b", { kind: "x", n: 2 }], ["c", { kind: "y", n: 3 }]]);
    await bob.setBatch([["a", { kind: "x", n: 100 }]]);
    await ann.delete("c");
    const sums = await ann.aggregate([{ $group: { _id: "$kind", total: { $sum: "$n" } } }, { $sort: { _id: 1 } }]);
    expect(sums).toEqual({ docs: [{ _id: "x", total: 3 }], truncated: false });
    // A $lookup into the collection itself sees only the partition
    const joined = await ann.aggregate([{ $match: { _key: "a" } }, { $lookup: { from: name, localField: "kind", foreignField: "kind", as: "same" } }, { $project: { n: { $size: "$same" } } }]);
    expect(joined.docs.map((doc) => doc["n"])).toEqual([2]);
    expect(await ann.aggregate([{ $sort: { n: 1 } }], { maxResults: 1 })).toMatchObject({ truncated: true, docs: [{ n: 1 }] });
    await expect(ann.aggregate([{ $merge: "other" }])).rejects.toThrow(/read-only/);
    await expect(ann.aggregate([{ $out: "other" }])).rejects.toThrow(/\$out/);
    await expect(ann.aggregate([{ $match: { $where: "true" } }])).rejects.toThrow(/\$where/);
    await expect(ann.aggregate([], { maxResults: 0 })).rejects.toThrow(/maxResults/);
    await expect(ann.aggregate([], { maxTime: ms(0) })).rejects.toThrow(/maxTime/);
    // A time is a Duration: a plain number of milliseconds is a TypeError (roadmap R11)
    await expect(ann.aggregate([], { maxTime: 5 as never })).rejects.toThrow(TypeError);
    expect((await root.aggregate([{ $count: "n" }])).docs).toEqual([]); // the storage without a partition has no items
    // Another collection needs its own right: the storage reads only its own collection
    await expect(ann.aggregate([{ $unionWith: "__storage_counters" }])).rejects.toThrow(/collections of the scope/);
    await expect(ann.aggregate([{ $lookup: { from: "users", localField: "a", foreignField: "b", as: "x" } }])).rejects.toThrow(/collections of the scope/);
  });

  it("refuses a partition with the separator, and a maxTombstones that is not a whole number", () => {
    expect(() => fresh({ partition: "a\u001fb" })).toThrow(/U\+001F/);
    expect(() => fresh({ partition: "" })).toThrow(/U\+001F/);
    expect(() => fresh({ maxTombstones: -1 })).toThrow(/maxTombstones/);
    expect(() => fresh({ writeLease: ms(0) })).toThrow(/writeLease/);
    expect(() => fresh({ writeLease: 1000 as never })).toThrow(TypeError);
  });
});
