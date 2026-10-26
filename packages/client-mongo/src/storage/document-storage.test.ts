/**
 * `MongoDocumentStorage` (roadmap CLI-24). The contract of `CollectionStorage`, the partitions, the
 * documents and the change log run against a real MongoDB: set `MONGO_TEST_URL` (CI starts a
 * `mongo:7` service). The filter of the queries is pure, so its tests always run.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ms } from "@procedures/client";
import { BSON, MongoClient, type Db, type Document } from "mongodb";
import { queryEntries, type StorageSelector } from "@procedures/collections";
import { contractVersionOf, describeCollectionStorageContract, type ContractItem } from "@procedures/collections/testing";
import { versionConflictsOf } from "@procedures/collections";
import {
  DEFAULT_STORED_FORM,
  DOCUMENT_STORAGE_FIELDS,
  MongoDocumentStorage,
  TOMBSTONE_FIELD,
  decodeStoredDocument,
  selectorPrefilter,
  type MongoDocumentStorageOptions,
  type StoredForm,
} from "./document-storage.js";

/**
 * A stored form of an app (roadmap CLI-76), a generic example. A partition is `<tenant>` or
 * `<tenant>/<scope>`. The stored `_id` is `<tenant>:<id>` (the bare id for the tenant `main`), with
 * `<scope>|` in front of it in a scope. The document has the field `tenant`, and `scope` only in a
 * scope: a document of the tenant itself has no `scope` field. `partitionOf` reads the fields, else
 * the stored `_id` (a delete event has only the `_id`).
 */
function partsOf(partition: string | undefined): { tenant: string; scope: string | undefined } {
  const [tenant = "main", ...scope] = (partition ?? "main").split("/");
  return { tenant, scope: scope.length > 0 ? scope.join("/") : undefined };
}

const appForm: StoredForm = {
  storedId: (partition, id) => {
    const { tenant, scope } = partsOf(partition);
    const base = tenant === "main" ? id : `${tenant}:${id}`;
    return scope === undefined ? base : `${scope}|${base}`;
  },
  idOf: (stored, partition) => {
    if (typeof stored !== "string") return undefined;
    const { tenant, scope } = partsOf(partition);
    let id = stored;
    if (scope !== undefined) {
      if (!id.startsWith(`${scope}|`)) return undefined;
      id = id.slice(scope.length + 1);
    }
    if (tenant !== "main") {
      if (!id.startsWith(`${tenant}:`)) return undefined;
      id = id.slice(tenant.length + 1);
    }
    return id;
  },
  partitionFields: (partition) => partsOf(partition),
  partitionOf: (doc) => {
    if (typeof doc["tenant"] === "string") return typeof doc["scope"] === "string" ? `${doc["tenant"]}/${doc["scope"]}` : doc["tenant"];
    const id: unknown = doc["_id"];
    if (typeof id !== "string") return undefined;
    // `<scope>|<tenant>:<id>`; a bare id is of the tenant main (in this example, an id of main has no ':')
    const bar = id.indexOf("|");
    const rest = bar >= 0 ? id.slice(bar + 1) : id;
    const colon = rest.indexOf(":");
    const tenant = colon >= 0 ? rest.slice(0, colon) : "main";
    return bar >= 0 ? `${tenant}/${id.slice(0, bar)}` : tenant;
  },
};

describe("the stored form: the defaults and their inverse (CLI-76)", () => {
  it("gives the stored _id of 0.34.0, its inverse, and the partition of a document", () => {
    const form = DEFAULT_STORED_FORM;
    expect(form.storedId(undefined, "a")).toBe("a");
    expect(form.storedId("t1", "a")).toBe("t1\u001fa");
    expect(form.idOf(form.storedId("t1", "a"), "t1")).toBe("a");
    expect(form.idOf("a", undefined)).toBe("a");
    expect(form.idOf("t2\u001fa", "t1")).toBeUndefined();
    expect(form.idOf("t1\u001fa", undefined)).toBeUndefined();
    expect(form.idOf(5, undefined)).toBeUndefined();
    expect(form.partitionFields("t1")).toEqual({ _part: "t1" });
    expect(form.partitionFields(undefined)).toEqual({ _part: undefined });
    // The partition field when the document has it, else the part of _id before U+001F (a delete event has only documentKey)
    expect(form.partitionOf({ _id: "t1\u001fa", _part: "t1" })).toBe("t1");
    expect(form.partitionOf({ _id: "t2\u001fa" })).toBe("t2");
    expect(form.partitionOf({ _id: "a" })).toBeUndefined();
    expect(form.partitionOf({ _id: 5 })).toBeUndefined();
    expect(Object.isFrozen(form)).toBe(true);
    expect(DOCUMENT_STORAGE_FIELDS).toEqual(["_key", "_part", "_seq", "_ord", "_tomb", "_json", "_kid", "_kpf"]);
    expect(TOMBSTONE_FIELD).toBe("_tomb");
  });

  it("gives the inverse of the form of an app", () => {
    for (const partition of ["main", "acme", "acme/board:1", "main/board:1"]) {
      const stored = appForm.storedId(partition, "n:1");
      expect(appForm.idOf(stored, partition), partition).toBe("n:1");
    }
    expect(appForm.storedId("acme/board:1", "n1")).toBe("board:1|acme:n1");
    expect(appForm.idOf("beta:n1", "acme")).toBeUndefined();
    // partitionOf reads the fields, else the stored _id
    expect(appForm.partitionOf({ _id: "x", tenant: "acme", scope: "board:1" })).toBe("acme/board:1");
    for (const partition of ["main", "acme", "acme/board:1", "main/board:1"]) {
      expect(appForm.partitionOf({ _id: appForm.storedId(partition, "n1") }), partition).toBe(partition);
    }
    expect(appForm.partitionOf({ _id: 5 })).toBeUndefined();
  });

  it("refuses a form without its four functions, and partition fields that are empty or that the storage writes", () => {
    const base = { collection: "c" };
    for (const name of ["storedId", "idOf", "partitionFields", "partitionOf"]) {
      expect(() => new MongoDocumentStorage({ ...base, form: { ...DEFAULT_STORED_FORM, [name]: undefined } as never }), name).toThrow(TypeError);
    }
    expect(() => new MongoDocumentStorage({ ...base, form: { ...DEFAULT_STORED_FORM, partitionFields: () => ({}) } })).toThrow(/at least one field/);
    for (const name of ["_id", "_seq", "_key", "_tomb", "_kpf", "$p", "a.b"]) {
      expect(() => new MongoDocumentStorage({ ...base, form: { ...DEFAULT_STORED_FORM, partitionFields: () => ({ [name]: "x" }) } }), name).toThrow(TypeError);
    }
    const storage = new MongoDocumentStorage({ ...base, form: { ...DEFAULT_STORED_FORM, partitionFields: (partition) => ({ _part: partition }) } });
    expect(new MongoDocumentStorage(base).form).toBe(DEFAULT_STORED_FORM);
    expect(storage.forPartition("t1").form).toBe(storage.form);
  });

  it("decodes a raw document as the storage reads it (decodeStoredDocument)", () => {
    expect(decodeStoredDocument({ _id: "t1\u001fq", _key: "q", _seq: 1, _ord: 1, _part: "t1", v: 1 })).toEqual({ id: "q", partition: "t1", item: { _id: "q", v: 1 } });
    expect(decodeStoredDocument({ _id: "t1\u001fq", _key: "q", _seq: 1, _ord: 1, _part: "t1", v: 1 }, { addId: false })).toEqual({ id: "q", partition: "t1", item: { v: 1 } });
    expect(decodeStoredDocument({ _id: "q", _key: "q", _seq: 2, _tomb: true })).toBeUndefined();
    expect(decodeStoredDocument({ _id: "j", _key: "j", _seq: 3, _ord: 3, _json: '{"a":1}' })?.item).toEqual({ _id: "j", a: 1 });
    expect(decodeStoredDocument({ _id: "j", _key: "j", _seq: 3, _ord: 3, _json: "[1,2]" })?.item).toEqual([1, 2]);
    expect(decodeStoredDocument({ _id: "own", _key: "own", _seq: 2, _ord: 2, _kid: true, k: "x" }, { addId: false })?.item).toEqual({ _id: "own", k: "x" });
    // The form of an app: the partition from partitionOf, the partition fields of _kpf back, a document from outside the storage as it was
    const scoped = { _id: "board:1|acme:n1", _key: "n1", _seq: 3, _ord: 1, tenant: "acme", scope: "board:1", _kpf: ["tenant"], title: "x" };
    expect(decodeStoredDocument(scoped, { form: appForm })).toEqual({ id: "n1", partition: "acme/board:1", item: { _id: "n1", tenant: "acme", title: "x" } });
    expect(decodeStoredDocument({ _id: "acme:old", tenant: "acme", title: "t" }, { form: appForm })).toEqual({ id: "old", partition: "acme", item: { _id: "old", title: "t" } });
    // A partition field with another value than the partition stays in the item
    expect(decodeStoredDocument({ _id: "acme:old", tenant: "acme", scope: "x", title: "t" }, { form: appForm, partition: "acme" })?.item).toEqual({ _id: "old", scope: "x", title: "t" });
    expect(decodeStoredDocument({ _id: new BSON.ObjectId(), tenant: "acme", title: "t" }, { form: appForm })).toBeUndefined();
    expect(decodeStoredDocument({ _id: "beta:n1", _key: "n1", tenant: "beta" }, { form: appForm, partition: "acme" })).toEqual({ id: "n1", partition: "acme", item: { _id: "n1" } });
  });

  it("with storedId, tests a condition on _id against the stored _id; the storage fields stay out", () => {
    const storedId = (id: string) => `p:${id}`;
    expect(selectorPrefilter({ _id: "a" }, { storedId })).toEqual({ _id: "p:a" });
    expect(selectorPrefilter({ _id: { $eq: "a", $in: ["a", "b"] } }, { storedId })).toEqual({ _id: { $eq: "p:a", $in: ["p:a", "p:b"] } });
    expect(selectorPrefilter({ _id: 5 }, { storedId })).toBeUndefined();
    expect(selectorPrefilter({ _id: { $in: ["a", 5] } }, { storedId })).toBeUndefined();
    const refuses = () => {
      throw new Error("no");
    };
    expect(selectorPrefilter({ _id: "a", n: 1 }, { storedId: refuses })).toEqual({ n: 1 });
    expect(selectorPrefilter({ tenant: "x", title: "y" }, { storageFields: ["tenant"] })).toEqual({ title: "y" });
    expect(selectorPrefilter({ $or: [{ _id: "a" }, { _id: "b" }] }, { storedId })).toEqual({ $or: [{ _id: "p:a" }, { _id: "p:b" }] });
  });
});

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
function fresh<T = ContractItem>(options: Partial<MongoDocumentStorageOptions<T>> = {}): MongoDocumentStorage<T> {
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
    createWithVersions: (versionOf) => fresh({ versionOf }),
  },
  { describe: withMongo, it },
);

describeCollectionStorageContract(
  "MongoDocumentStorage with a partition",
  {
    create: () => fresh({ partition: "t1" }),
    createWithMaxTombstones: (max) => fresh({ partition: "t1", maxTombstones: max }),
    createWithQueryPolicy: (policy) => fresh({ partition: "t1", queryPolicy: policy }),
    createWithVersions: (versionOf) => fresh({ partition: "t1", versionOf }),
  },
  { describe: withMongo, it },
);

// The form of an app, in a partition whose documents have no `scope` field (the filter is $exists: false)
describeCollectionStorageContract(
  "MongoDocumentStorage with the stored form of an app (CLI-76)",
  {
    create: () => fresh({ form: appForm, partition: "acme" }),
    createWithMaxTombstones: (max) => fresh({ form: appForm, partition: "acme", maxTombstones: max }),
    createWithQueryPolicy: (policy) => fresh({ form: appForm, partition: "acme", queryPolicy: policy }),
    createWithVersions: (versionOf) => fresh({ form: appForm, partition: "acme", versionOf }),
  },
  { describe: withMongo, it },
);

withMongo("MongoDocumentStorage with another stored form (CLI-76)", () => {
  /** The stored documents of a collection, by `_id`. */
  const rawById = async (name: string) => new Map((await db.collection(name).find({}).toArray()).map((doc) => [doc._id as unknown, doc]));
  const hex = (doc: unknown) => Buffer.from(BSON.serialize(doc as Document)).toString("hex");

  it("with the defaults, writes the documents of 0.34.0, byte for byte", async () => {
    const name = `c${++next}`;
    const root = fresh<unknown>({ collection: name });
    await root.setBatch([
      ["flat", { title: "a", n: 1 }],
      ["own", { _id: "own", k: "x" }],
      ["json", [1, 2]],
    ]);
    const t1 = root.forPartition("t1");
    await t1.set("p", { v: true });
    await root.set("flat", { title: "b" });
    await t1.delete("p");
    const raw = await rawById(name);
    const expected: Document[] = [
      { _id: "flat", _key: "flat", _seq: 5, _ord: 1, title: "b" },
      { _id: "own", _key: "own", _seq: 2, _ord: 2, _kid: true, k: "x" },
      { _id: "json", _key: "json", _seq: 3, _ord: 3, _json: "[1,2]" },
      { _id: "t1\u001fp", _key: "p", _seq: 6, _tomb: true, _part: "t1" },
    ];
    expect(raw.size).toBe(expected.length);
    for (const doc of expected) expect(hex(raw.get(doc["_id"])), String(doc["_id"])).toBe(hex(doc));
    // The flat document of a partition, before its delete
    // fresh() takes the next number too: keep the name
    const otherName = `c${++next}`;
    const other = fresh<unknown>({ collection: otherName, partition: "t1" });
    await other.set("q", { v: 1 });
    const [stored] = await db.collection(otherName).find({}).toArray();
    expect(hex(stored)).toBe(hex({ _id: "t1\u001fq", _key: "q", _seq: 1, _ord: 1, _part: "t1", v: 1 }));
  });

  it("writes the stored _id and the partition fields of the form, and reads each partition apart", async () => {
    const name = `c${++next}`;
    const root = fresh<{ title: string }>({ form: appForm, collection: name });
    const partitions = ["main", "acme", "acme/board:1", "main/board:1"];
    for (const partition of partitions) await root.forPartition(partition).set("n1", { title: `in ${partition}` });
    const raw = await rawById(name);
    expect([...raw.keys()].sort()).toEqual(["acme:n1", "board:1|acme:n1", "board:1|n1", "n1"]);
    expect(raw.get("acme:n1")).toEqual({ _id: "acme:n1", _key: "n1", _seq: 2, _ord: 2, tenant: "acme", title: "in acme" });
    expect(raw.get("acme:n1")).not.toHaveProperty("scope");
    expect(raw.get("board:1|acme:n1")).toMatchObject({ tenant: "acme", scope: "board:1" });
    for (const partition of partitions) {
      const storage = root.forPartition(partition);
      expect(await storage.get("n1"), partition).toEqual({ title: `in ${partition}` });
      expect(await storage.find((item) => item.title.startsWith("in")), partition).toEqual([{ title: `in ${partition}` }]);
      expect(await storage.query({ title: `in ${partition}` }), partition).toEqual([["n1", { title: `in ${partition}` }]]);
      expect(await storage.query({ title: "in main" }), partition).toEqual(partition === "main" ? [["n1", { title: "in main" }]] : []);
      expect((await storage.getChangesSince()).changed, partition).toEqual([["n1", { title: `in ${partition}` }]]);
      expect(await storage.size(), partition).toBe(1);
    }
    // The change log of a partition gives its writes and its deletes only
    const acme = root.forPartition("acme");
    const { version } = await acme.getChangesSince();
    await acme.set("n2", { title: "new" });
    await root.forPartition("main").set("n3", { title: "elsewhere" });
    await acme.delete("n1");
    expect(await acme.getChangesSince(version)).toMatchObject({ full: false, changed: [["n2", { title: "new" }]], deleted: ["n1"] });
    expect((await rawById(name)).get("acme:n1")).toEqual({ _id: "acme:n1", _key: "n1", _seq: 7, _tomb: true, tenant: "acme" });
    // A query on _id reads the stored _id; a field of the partition is not a field of an item
    await acme.set("own", { _id: "own", title: "own" } as never);
    expect((await acme.query({ _id: "own" })).map(([id]) => id)).toEqual(["own"]);
    expect(await acme.query({ tenant: "acme" } as never)).toEqual([]);
    // A partition field with the value of the partition: the write leaves it out, the read gives it back
    await acme.set("same", { title: "same", tenant: "acme" } as never);
    expect(await acme.get("same")).toEqual({ title: "same", tenant: "acme" });
    expect((await rawById(name)).get("acme:same")).toEqual({ _id: "acme:same", _key: "same", _seq: 9, _ord: 9, tenant: "acme", _kpf: ["tenant"], title: "same" });
    // The same field with another value would put the document in another partition: refused
    await expect(acme.set("odd", { title: "odd", tenant: "beta" } as never)).rejects.toThrow(TypeError);
    expect(await acme.has("odd")).toBe(false);
    // A top-level key with $ is stored as JSON, and comes back as it was
    await acme.set("dollar", { title: "dollar", $x: 1 } as never);
    expect(await acme.get("dollar")).toEqual({ title: "dollar", $x: 1 });
    expect(typeof (await rawById(name)).get("acme:dollar")?.["_json"]).toBe("string");
    expect((await acme.aggregate([{ $count: "n" }])).docs).toEqual([{ n: 4 }]);
  });

  it("reads the documents written before the storage, gives them the version 0, and the first write gives them a version", async () => {
    const name = `c${++next}`;
    await db.collection(name).insertMany([
      { _id: "acme:old1" as never, tenant: "acme", title: "first" },
      { _id: "acme:old2" as never, tenant: "acme", title: "second" },
      { _id: "acme:old3" as never, tenant: "acme", title: "third" },
      { _id: "board:1|acme:old1" as never, tenant: "acme", scope: "board:1", title: "scoped" },
      { _id: "beta:old1" as never, tenant: "beta", title: "other tenant" },
      // An _id that idOf does not name: not an item, for the reads and for size()
      { _id: new BSON.ObjectId() as never, tenant: "acme", title: "no id" },
    ]);
    const root = fresh<{ title: string }>({ form: appForm, collection: name, versionOf: (item) => item.title });
    const acme = root.forPartition("acme");
    // The item of a document from outside the storage has its _id, and has the form of a written item: no field with the value of the partition
    expect(await acme.get("old1")).toEqual({ _id: "old1", title: "first" });
    expect(await acme.has("old2")).toBe(true);
    expect(await acme.size()).toBe(3);
    expect(await acme.getAll()).toHaveLength(3);
    expect((await acme.getIds()).sort()).toEqual(["old1", "old2", "old3"]);
    expect(await acme.query({ title: "second" })).toEqual([["old2", { _id: "old2", title: "second" }]]);
    expect([...(await acme.getBatch(["old3", "old1"])).keys()]).toEqual(["old3", "old1"]);
    expect(await acme.versionOf("old1")).toBe("0");
    expect(await root.forPartition("acme/board:1").get("old1")).toEqual({ _id: "old1", title: "scoped" });
    expect(await root.forPartition("beta").getAll()).toEqual([{ _id: "old1", title: "other tenant" }]);
    const full = await acme.getChangesSince();
    expect(full.full).toBe(true);
    expect(full.changed.map(([id]) => id).sort()).toEqual(["old1", "old2", "old3"]);

    // The first write gives a version, keeps the place before the new items, and is in the next delta
    await acme.set("old1", { title: "first, edited" }, { expectedVersion: "first" });
    await acme.set("new", { title: "new" });
    expect(Number(await acme.versionOf("old1"))).toBeGreaterThan(0);
    const edited = (await rawById(name)).get("acme:old1");
    expect(edited).toMatchObject({ _id: "acme:old1", _key: "old1", _ord: 0, tenant: "acme", title: "first, edited" });
    expect(typeof edited?.["_seq"]).toBe("number");
    expect((await acme.getIds()).slice(-2)).toEqual(["old1", "new"]);
    expect((await acme.getChangesSince(full.version)).changed.map(([id]) => id)).toEqual(["old1", "new"]);

    // A patch, a precondition, a delete and a clear of a document without the fields of the storage
    expect(await acme.patch("old2", { title: "second, patched" })).toEqual({ _id: "old2", title: "second, patched" });
    // The write keeps the item flat: _id and the partition field are noted, not stored as JSON
    expect((await rawById(name)).get("acme:old2")).toMatchObject({ _key: "old2", _kid: true, tenant: "acme", title: "second, patched" });
    expect((await rawById(name)).get("acme:old2")).not.toHaveProperty("_kpf");
    expect((await rawById(name)).get("acme:old2")).not.toHaveProperty("_json");
    expect(await acme.get("old2")).toEqual({ _id: "old2", title: "second, patched" });
    await expect(acme.set("old3", { title: "x" }, { expectedVersion: "not third" })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    const before = await acme.getChangesSince();
    expect(await acme.delete("old3", { expectedVersion: "third" })).toBe(true);
    expect(await acme.getChangesSince(before.version)).toMatchObject({ full: false, changed: [], deleted: ["old3"] });
    await acme.clear();
    expect(await acme.size()).toBe(0);
    // The other partitions keep their documents as they were
    expect((await rawById(name)).get("beta:old1")).toEqual({ _id: "beta:old1", tenant: "beta", title: "other tenant" });
    expect((await rawById(name)).get("board:1|acme:old1")).toEqual({ _id: "board:1|acme:old1", tenant: "acme", scope: "board:1", title: "scoped" });
  });

  it("keeps a stored _id that is not a text, and gives back the id of the inverse", async () => {
    const name = `c${++next}`;
    await db.collection(name).insertOne({ _id: 7 as never, title: "seven" });
    const storage = fresh<{ title: string }>({
      collection: name,
      form: {
        ...DEFAULT_STORED_FORM,
        storedId: (_partition, id) => (/^#\d+$/.test(id) ? Number(id.slice(1)) : id),
        idOf: (stored) => (typeof stored === "number" ? `#${stored}` : typeof stored === "string" ? stored : undefined),
      },
    });
    expect(await storage.get("#7")).toEqual({ _id: "#7", title: "seven" });
    await storage.set("#8", { title: "eight" });
    await storage.set("plain", { title: "text" });
    expect(await db.collection(name).findOne({ _id: 8 as never })).toMatchObject({ _key: "#8", title: "eight" });
    expect([...(await storage.getBatch(["#8", "#7"])).keys()]).toEqual(["#8", "#7"]);
    expect(await storage.getIds()).toEqual(["#7", "#8", "plain"]);
    expect((await storage.query({ title: { $in: ["seven", "text"] } })).map(([id]) => id)).toEqual(["#7", "plain"]);
    expect(await storage.delete("#7")).toBe(true);
    expect(await db.collection(name).findOne({ _id: 7 as never })).toMatchObject({ _key: "#7", _tomb: true });
    expect((await storage.getChangesSince()).changed.map(([id]) => id)).toEqual(["#8", "plain"]);
  });

  it("orders the documents from outside the storage by _id: they all have the place 0", async () => {
    const name = `c${++next}`;
    await db.collection(name).insertMany([
      { _id: "c" as never, n: 3 },
      { _id: "a" as never, n: 1 },
      { _id: "b" as never, n: 2 },
    ]);
    const storage = fresh<{ n: number }>({ collection: name });
    await storage.set("new", { n: 4 });
    expect(await storage.getIds()).toEqual(["a", "b", "c", "new"]);
    expect((await storage.getEntries()).map(([id]) => id)).toEqual(["a", "b", "c", "new"]);
    expect(await storage.getAll()).toEqual([{ _id: "a", n: 1 }, { _id: "b", n: 2 }, { _id: "c", n: 3 }, { n: 4 }]);
    expect((await storage.getChangesSince()).changed.map(([id]) => id)).toEqual(["a", "b", "c", "new"]);
    expect((await storage.query({ n: { $in: [3, 1] } })).map(([id]) => id)).toEqual(["a", "c"]);
  });

  it("keeps keys with $ and dots below the top level, and a top-level key with a dot, as they are", async () => {
    const name = `c${++next}`;
    const storage = fresh<Record<string, unknown>>({ collection: name });
    const item = { title: "q", eagerQuery: { _id: { $nin: ["a", "b"] } }, defs: [{ $config: { "x.y": 2 } }], "a.b": 1 };
    await storage.set("q", item);
    expect(await storage.get("q")).toEqual(item);
    const raw = await db.collection(name).findOne({ _id: "q" as never });
    expect(raw).toEqual({ _id: "q", _key: "q", _seq: 1, _ord: 1, ...item });
    expect(raw).not.toHaveProperty("_json");
    // A replace, a patch and a batch write the same flat form
    await storage.set("q", { ...item, title: "q2" });
    expect(await storage.patch("q", { title: "q3" })).toEqual({ ...item, title: "q3" });
    await storage.setBatch([["r", { filter: { $or: [{ n: 1 }] } }]]);
    expect(await db.collection(name).findOne({ _id: "r" as never })).toMatchObject({ filter: { $or: [{ n: 1 }] } });
    expect(await storage.get("r")).toEqual({ filter: { $or: [{ n: 1 }] } });
    expect((await storage.query({ title: "q3" })).map(([id]) => id)).toEqual(["q"]);
    expect((await storage.getChangesSince()).changed.map(([id]) => id)).toEqual(["q", "r"]);
    // An object that MongoDB gives back as a DBRef is refused, not stored as JSON
    await expect(storage.set("ref", { link: { $ref: "notes", $id: "n1" } })).rejects.toThrow(/DBRef/);
    expect(await storage.has("ref")).toBe(false);
    // A key __proto__ and a class instance other than Date stay JSON
    await storage.set("proto", JSON.parse('{"o":{"__proto__":{"x":1}}}') as Record<string, unknown>);
    expect(typeof (await db.collection(name).findOne({ _id: "proto" as never }))?.["_json"]).toBe("string");
  });
});

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
      ["nested-dollar", { q: { $in: [1], "x.y": 2 } }],
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
    for (const id of ["null", "text", "list", "dollar", "reserved", "other-id", "proto"]) expect(typeof byKey.get(id)?.["_json"], id).toBe("string");
    // A top-level key with a dot, and keys with $ or dots below the top level, stay flat (CLI-76)
    expect(byKey.get("dotted")).toMatchObject({ "a.b": 1 });
    expect(byKey.get("nested-dollar")).toMatchObject({ q: { $in: [1], "x.y": 2 } });
    for (const id of ["dotted", "nested-dollar"]) expect(byKey.get(id), id).not.toHaveProperty("_json");
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

  it("with the watermark, a writer between the test of a version and the write makes a conflict (CLI-16)", async () => {
    const name = `c${++next}`;
    // The next bulk write of this storage first lets another writer change the collection, as
    // another process can between the test and the write (another database object: another queue)
    let before: (() => Promise<void>) | undefined;
    const racingDb = new Proxy(db, {
      get(target, prop) {
        if (prop === "collection") {
          return (collectionName: string) => {
            const real = target.collection(collectionName);
            if (collectionName !== name) return real;
            return new Proxy(real, {
              get(collection, key) {
                const value = Reflect.get(collection, key, collection) as unknown;
                if (key === "bulkWrite") {
                  return async (...args: unknown[]) => {
                    const race = before;
                    before = undefined;
                    if (race) await race();
                    return (value as (...a: unknown[]) => unknown).apply(collection, args);
                  };
                }
                return typeof value === "function" ? value.bind(collection) : value;
              },
            });
          };
        }
        const value = Reflect.get(target, prop, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const storage = new MongoDocumentStorage<ContractItem>({ collection: name, db: () => racingDb, transactions: "never", versionOf: contractVersionOf });
    const other = fresh({ collection: name, transactions: "never" });
    const item = (id: string, n: number): ContractItem => ({ id, n });
    await storage.set("a", item("a", 1));

    // A set: the other writer changes the item, so the guard on _seq fails
    before = () => other.set("a", item("a", 7));
    const changed = await storage.set("a", item("a", 2), { expectedVersion: "v1" }).catch((error: unknown) => error);
    expect(changed).toMatchObject({ code: "VERSION_CONFLICT" });
    expect(versionConflictsOf(changed)).toEqual([{ id: "a", expected: "v1", found: true, value: item("a", 7), version: "v7" }]);
    expect(await storage.get("a")).toEqual(item("a", 7));

    // The other writer writes an item with the expected version again: still a conflict, with its version
    before = () => other.set("a", item("a", 7));
    const same = await storage.set("a", item("a", 3), { expectedVersion: "v7" }).catch((error: unknown) => error);
    expect(versionConflictsOf(same)).toEqual([{ id: "a", expected: "v7", found: true, value: item("a", 7), version: "v7" }]);

    // A delete: the guard of the tombstone finds no document
    before = () => other.set("a", item("a", 8));
    const deleted = await storage.delete("a", { expectedVersion: "v7" }).catch((error: unknown) => error);
    expect(versionConflictsOf(deleted)).toEqual([{ id: "a", expected: "v7", found: true, value: item("a", 8), version: "v8" }]);
    expect(await storage.has("a")).toBe(true);

    // A new item: the other writer makes and deletes it, so its tombstone stops the insert
    before = async () => {
      await other.set("b", item("b", 1));
      await other.delete("b");
    };
    const created = await storage.set("b", item("b", 2), { expectedVersion: null }).catch((error: unknown) => error);
    expect(versionConflictsOf(created)).toEqual([{ id: "b", expected: null, found: false, version: null }]);
    expect(await storage.has("b")).toBe(false);

    // Without a writer between, the guards hold
    await storage.set("a", item("a", 9), { expectedVersion: "v8" });
    expect(await storage.delete("a", { expectedVersion: "v9" })).toBe(true);
    await storage.setBatch([["b", item("b", 3)], ["b", item("b", 4)]], { expectedVersions: [["b", null]] });
    expect(await storage.get("b")).toEqual(item("b", 4));
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
