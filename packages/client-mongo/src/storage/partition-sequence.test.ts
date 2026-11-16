/**
 * The option `sequence: "partition"` of `MongoDocumentStorage` (roadmap CLI-96): a counter and a write queue for each
 * partition. The contract of `CollectionStorage` runs with the option, on both paths of the numbers. The other rows read
 * the counter documents, the change log of each partition, and the refusal of a collection that has the other sequence.
 *
 * These rows need `MONGO_TEST_URL` (CI starts a `mongo:7` service).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { describeCollectionStorageContract, type ContractItem } from "@procedures/collections/testing";
import { MongoDocumentStorage, type MongoDocumentStorageOptions } from "./document-storage.js";

const url = process.env["MONGO_TEST_URL"];
const withMongo = url ? describe : describe.skip;

const COUNTERS = "__storage_counters";

let client: MongoClient | undefined;
/** A second client: a store on this client writes as another process does. */
let secondClient: MongoClient | undefined;
let db: Db;
let secondDb: Db;
let next = 0;

beforeAll(async () => {
  if (!url) return;
  client = new MongoClient(url);
  await client.connect();
  db = client.db(`client_mongo_sequence_${process.pid}_${Date.now()}`);
  secondClient = new MongoClient(url);
  await secondClient.connect();
  secondDb = secondClient.db(db.databaseName);
});

afterAll(async () => {
  if (!client) return;
  await db.dropDatabase();
  await client.close();
  await secondClient?.close();
});

/** A new store with a counter for each partition on a new collection of the test database. */
function fresh<T = ContractItem>(options: Partial<MongoDocumentStorageOptions<T>> = {}): MongoDocumentStorage<T> {
  return new MongoDocumentStorage<T>({ collection: `s${++next}`, db: () => db, client: () => client!, sequence: "partition", ...options });
}

/** The counter document of an `_id`, without its write state: the random epoch, the pending numbers and the last release. */
async function counterOf(id: string): Promise<Record<string, unknown> | null> {
  const doc = await db.collection<{ _id: string }>(COUNTERS).findOne({ _id: id });
  if (!doc) return null;
  const { epoch: _epoch, pending: _pending, lastRelease: _lastRelease, ...rest } = doc as Record<string, unknown>;
  return rest;
}

describeCollectionStorageContract(
  "MongoDocumentStorage with a counter for each partition (CLI-96)",
  {
    create: () => fresh({ partition: "t1" }),
    createWithMaxTombstones: (max) => fresh({ partition: "t1", maxTombstones: max }),
    createWithQueryPolicy: (policy) => fresh({ partition: "t1", queryPolicy: policy }),
    createWithVersions: (versionOf) => fresh({ partition: "t1", versionOf }),
  },
  { describe: withMongo, it },
);

describeCollectionStorageContract(
  "MongoDocumentStorage with a counter for each partition and no transactions (CLI-96)",
  {
    create: () => fresh({ partition: "t1", transactions: "never" }),
    createWithMaxTombstones: (max) => fresh({ partition: "t1", transactions: "never", maxTombstones: max }),
    createWithQueryPolicy: (policy) => fresh({ partition: "t1", transactions: "never", queryPolicy: policy }),
    createWithVersions: (versionOf) => fresh({ partition: "t1", transactions: "never", versionOf }),
  },
  { describe: withMongo, it },
);

describe("the option sequence without a server (CLI-96)", () => {
  it("refuses a value other than collection and partition", () => {
    expect(() => new MongoDocumentStorage({ collection: "c", sequence: "tenant" as never })).toThrow(TypeError);
  });
});

withMongo("a counter for each partition on MongoDB (CLI-96)", () => {
  for (const transactions of ["auto", "never"] as const) {
    it(`gives each partition its own numbers and change log (transactions ${transactions})`, async () => {
      const store = fresh<{ v: number }>({ transactions });
      const collection = `s${next}`;
      const acme = store.forPartition("acme");
      const beta = store.forPartition("beta");
      const start = await acme.getChangesSince();
      await acme.set("a", { v: 1 });
      await beta.set("b", { v: 2 });
      await beta.set("c", { v: 3 });
      await store.set("plain", { v: 4 });
      // Each counter starts at 1: two partitions have the same numbers
      expect(await acme.versionOf("a")).toBe(await beta.versionOf("b"));
      expect(await counterOf(`seq\u001f${collection}\u001facme`)).toEqual({ _id: `seq\u001f${collection}\u001facme`, seq: 1 });
      expect(await counterOf(`seq\u001f${collection}\u001fbeta`)).toEqual({ _id: `seq\u001f${collection}\u001fbeta`, seq: 2 });
      expect(await counterOf(`seq\u001f${collection}\u001f`)).toEqual({ _id: `seq\u001f${collection}\u001f`, seq: 1 });
      // The counter of the collection has only the mark, and no numbers
      expect(await counterOf(collection)).toEqual({ _id: collection, sequence: "partition" });
      // The writes of beta are not changes of acme
      const changes = await acme.getChangesSince(start.version);
      expect(changes).toMatchObject({ full: false, changed: [["a", { v: 1 }]], deleted: [] });
      const after = await acme.getChangesSince(changes.version);
      await beta.delete("b");
      expect(await acme.getChangesSince(after.version)).toMatchObject({ full: false, changed: [], deleted: [] });
    });
  }

  it("lets two processes start a new collection at the same time", async () => {
    const collection = `s${++next}`;
    const first = new MongoDocumentStorage<{ v: number }>({ collection, db: () => db, client: () => client!, sequence: "partition" });
    const second = new MongoDocumentStorage<{ v: number }>({ collection, db: () => secondDb, client: () => secondClient!, sequence: "partition" });
    await Promise.all([first.forPartition("p1").set("a", { v: 1 }), second.forPartition("p2").set("b", { v: 2 }), second.forPartition("p1").set("c", { v: 3 })]);
    expect((await first.forPartition("p1").getAll()).map((item) => item.v).sort()).toEqual([1, 3]);
    expect(await counterOf(collection)).toEqual({ _id: collection, sequence: "partition" });
  });

  it("takes a collection whose default store only read: its counter has no numbers", async () => {
    const collection = `s${++next}`;
    const plain = new MongoDocumentStorage<{ v: number }>({ collection, db: () => db, client: () => client! });
    await plain.getChangesSince();
    expect(await counterOf(collection)).toEqual({ _id: collection, seq: 0 });
    const store = new MongoDocumentStorage<{ v: number }>({ collection, db: () => db, client: () => client!, sequence: "partition" });
    await store.set("a", { v: 1 });
    expect(await counterOf(collection)).toEqual({ _id: collection, seq: 0, sequence: "partition" });
  });

  it("refuses a collection with numbers on its counter of the collection, and tries again at the next call", async () => {
    const collection = `s${++next}`;
    const plain = new MongoDocumentStorage<{ v: number }>({ collection, db: () => db, client: () => client! });
    await plain.set("a", { v: 1 });
    const store = new MongoDocumentStorage<{ v: number }>({ collection, db: () => db, client: () => client!, sequence: "partition" });
    await expect(store.set("b", { v: 2 })).rejects.toThrow(/has numbers on its counter of the collection/);
    await expect(store.getChangesSince()).rejects.toThrow(/has numbers on its counter of the collection/);
    await expect(store.forPartition("p").set("b", { v: 2 })).rejects.toThrow(/has numbers on its counter of the collection/);
    // The refusal writes nothing: the default store goes on
    expect(await counterOf(collection)).toEqual({ _id: collection, seq: 1 });
    await plain.set("c", { v: 3 });
    expect((await plain.getAll()).map((item) => item.v).sort()).toEqual([1, 3]);
  });

  for (const transactions of ["auto", "never"] as const) {
    it(`makes a default store refuse a collection with a counter for each partition (transactions ${transactions})`, async () => {
      const collection = `s${++next}`;
      const store = new MongoDocumentStorage<{ v: number }>({ collection, db: () => db, client: () => client!, sequence: "partition" });
      await store.forPartition("p").set("a", { v: 1 });
      const plain = new MongoDocumentStorage<{ v: number }>({ collection, db: () => secondDb, client: () => secondClient!, transactions });
      await expect(plain.forPartition("p").set("b", { v: 2 })).rejects.toThrow(/has a counter for each partition/);
      await expect(plain.forPartition("p").getChangesSince()).rejects.toThrow(/has a counter for each partition/);
      // The refused write keeps no number and no pending range on the counter of the collection
      const counter = await db.collection<{ _id: string; pending?: unknown[] }>(COUNTERS).findOne({ _id: collection });
      expect(counter?.pending ?? []).toEqual([]);
      expect(await store.forPartition("p").getAll()).toEqual([{ v: 1 }]);
    });
  }
});
