/**
 * The first write of one new id from two processes (roadmap CLI-103). The filter of a write of the
 * store holds the `_id` and the partition. Two writes that find no document both insert. MongoDB
 * retries such an insert only for a filter on the `_id` alone, so one write gets a duplicate key.
 *
 * The fail point `hangBeforeUpsertPerformsInsert` holds both writes after their query, so each round
 * has the race. The rows without the fail point count the same race with no hold. Each row prints a
 * line `first-write {json}`: its rounds, the errors of callers and the duplicate keys of the server.
 * A row with a hold fails when it has no duplicate key, because then it proved nothing.
 *
 * These rows need `MONGO_TEST_URL`. The rows with the fail point also need `enableTestCommands`.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, type CommandStartedEvent, type CommandSucceededEvent, type Db, type Document } from "mongodb";
import { MongoDocumentStorage, type MongoDocumentStorageOptions, type StoredForm } from "./document-storage.js";
import { setDefaultConnection } from "../connection.js";
import { MongoStorage } from "./mongo-storage.js";

interface Item {
  readonly v: string;
  readonly mail?: string;
}

const url = process.env["MONGO_TEST_URL"];
const withMongo = url ? describe : describe.skip;

const FAIL_POINT = "hangBeforeUpsertPerformsInsert";
const COUNTERS = "__storage_counters";
/** The time that a row waits for the two writes at the fail point. */
const REACH_MS = 2_000;
const ROW_TIMEOUT_MS = 60_000;
const HELD_ROUNDS = 4;
const OPEN_ROUNDS = 40;
const COUNTERS_ROUNDS = 10;
const PATCH_ROUNDS = 8;

let first: MongoClient;
let second: MongoClient;
let firstDb: Db;
let secondDb: Db;
let failPoints = false;
let next = 0;
/** The duplicate keys in the replies of the writes, and the writes of the items. */
let duplicates = 0;
let updates = 0;

function countWrite(event: CommandStartedEvent): void {
  if (event.commandName === "update" && event.command["update"] !== COUNTERS) updates++;
}

function countReply(event: CommandSucceededEvent): void {
  if (event.commandName !== "update") return;
  const errors = (event.reply as { writeErrors?: Array<{ code?: number }> }).writeErrors ?? [];
  duplicates += errors.filter((error) => error.code === 11000).length;
}

/** This function prints the record of a row, for the job log and the record of the item. */
function printRow(name: string, record: Record<string, unknown>): void {
  console.log(`first-write ${JSON.stringify({ name, ...record })}`);
}

function reset(): void {
  duplicates = 0;
  updates = 0;
}

/**
 * This function starts the writes with both of them held at the fail point, and opens the hold when
 * both arrive or at its limit. Another file can pass the fail point too, so a round can have no race.
 * Each row with a hold reads the count of duplicate keys, and so does not depend on one round.
 */
async function raced<R>(writes: ReadonlyArray<() => Promise<R>>): Promise<Array<PromiseSettledResult<R>>> {
  const admin = first.db("admin");
  const on = await admin.command({ configureFailPoint: FAIL_POINT, mode: "alwaysOn" });
  try {
    const started = writes.map((write) => write());
    await admin
      .command({ waitForFailPoint: FAIL_POINT, timesEntered: (on["count"] as number) + writes.length, maxTimeMS: REACH_MS })
      .catch(() => undefined);
    await admin.command({ configureFailPoint: FAIL_POINT, mode: "off" });
    return await Promise.allSettled(started);
  } finally {
    await admin.command({ configureFailPoint: FAIL_POINT, mode: "off" });
  }
}

const rejected = <R>(settled: ReadonlyArray<PromiseSettledResult<R>>): PromiseRejectedResult[] =>
  settled.filter((result): result is PromiseRejectedResult => result.status === "rejected");

/** Two stores of one new collection, one on each client, as two processes have. */
function pair(options: Partial<MongoDocumentStorageOptions<Item>> = {}): [MongoDocumentStorage<Item>, MongoDocumentStorage<Item>] {
  const collection = `first_${++next}`;
  const of = (db: Db, client: MongoClient): MongoDocumentStorage<Item> =>
    new MongoDocumentStorage<Item>({ collection, db: () => db, client: () => client, transactions: "never", ...options });
  return [of(firstDb, first), of(secondDb, second)];
}

/** This function makes the counters and the mark of the floor, so that a later upsert in a round is a write of an item. */
async function warmed(stores: ReadonlyArray<MongoDocumentStorage<Item>>): Promise<void> {
  for (const [index, store] of stores.entries()) await store.set(`warm${index}`, { v: "warm" });
}

/** A stored form with the same `_id` in each partition: a write in a second partition is a real duplicate. */
const SHARED_ID_FORM: StoredForm = {
  storedId: (_partition, id) => id,
  idOf: (stored) => (typeof stored === "string" ? stored : undefined),
  partitionFields: (partition) => ({ owner: partition }),
  partitionOf: (doc: Document) => (typeof doc["owner"] === "string" ? doc["owner"] : undefined),
};

withMongo("the first write of one new id from two processes", () => {
  beforeAll(async () => {
    first = new MongoClient(url!, { monitorCommands: true });
    second = new MongoClient(url!, { monitorCommands: true });
    await Promise.all([first.connect(), second.connect()]);
    for (const client of [first, second]) {
      client.on("commandStarted", countWrite);
      client.on("commandSucceeded", countReply);
    }
    const database = `first_write_${process.pid}`;
    firstDb = first.db(database);
    secondDb = second.db(database);
    failPoints = await first
      .db("admin")
      .command({ configureFailPoint: FAIL_POINT, mode: "off" })
      .then(
        () => true,
        () => false
      );
    if (!failPoints && process.env["MONGO_TEST_FAILPOINTS"] === "1") throw new Error("MONGO_TEST_FAILPOINTS is 1, but the server refused a fail point");
  });

  afterAll(async () => {
    await firstDb.dropDatabase();
    await Promise.all([first.close(), second.close()]);
  });

  it.for([
    { name: "no-partition", partition: undefined },
    { name: "partition", partition: "t1" },
  ])(
    "two held plain writes both end, $name",
    async ({ name, partition }, context) => {
      if (!failPoints) return context.skip();
      const [rootA, rootB] = pair();
      const a = partition === undefined ? rootA : rootA.forPartition(partition);
      const b = partition === undefined ? rootB : rootB.forPartition(partition);
      await warmed([a, b]);
      reset();
      const errors: string[] = [];
      for (let round = 0; round < HELD_ROUNDS; round++) {
        const id = `new${round}`;
        const settled = await raced([() => a.set(id, { v: "a" }), () => b.set(id, { v: "b" })]);
        for (const failure of rejected(settled)) errors.push(String((failure.reason as Error).message).slice(0, 80));
        expect(["a", "b"]).toContain((await a.get(id))?.v);
      }
      printRow(`held-${name}`, { rounds: HELD_ROUNDS, errors: errors.length, duplicates, updates, error: errors[0] });
      expect(errors).toEqual([]);
      expect(duplicates).toBeGreaterThan(0);
    },
    ROW_TIMEOUT_MS
  );

  it(
    "a batch that loses one id writes each of its ids",
    async (context) => {
      if (!failPoints) return context.skip();
      const [a, b] = pair();
      await warmed([a, b]);
      reset();
      const errors: string[] = [];
      for (let round = 0; round < HELD_ROUNDS; round++) {
        const settled = await raced([
          () => a.setBatch([[`shared${round}`, { v: "a" }], [`own${round}`, { v: "a" }]]),
          () => b.set(`shared${round}`, { v: "b" }),
        ]);
        for (const failure of rejected(settled)) errors.push(String((failure.reason as Error).message).slice(0, 80));
        expect((await a.get(`own${round}`))?.v).toBe("a");
      }
      printRow("held-batch", { rounds: HELD_ROUNDS, errors: errors.length, duplicates, updates, error: errors[0] });
      expect(errors).toEqual([]);
      expect(duplicates).toBeGreaterThan(0);
    },
    ROW_TIMEOUT_MS
  );

  it(
    "a reader with a cursor gets the retried write, at a number that it did not pass",
    async (context) => {
      if (!failPoints) return context.skip();
      const [a, b] = pair();
      await warmed([a, b]);
      let since = (await a.getChangesSince()).version;
      reset();
      const seen = new Map<string, string>();
      const read = async (): Promise<void> => {
        const changes = await a.getChangesSince(since);
        since = changes.version;
        for (const [id, value] of changes.changed) seen.set(id, value.v);
      };
      let errors = 0;
      for (let round = 0; round < HELD_ROUNDS; round++) {
        const settled = await raced([() => a.set(`read${round}`, { v: "a" }), () => b.set(`read${round}`, { v: "b" })]);
        await read();
        errors += rejected(settled).length;
      }
      await read();
      const lost: string[] = [];
      for (let round = 0; round < HELD_ROUNDS; round++) {
        const id = `read${round}`;
        if (seen.get(id) !== (await a.get(id))?.v) lost.push(id);
      }
      printRow("held-reader", { rounds: HELD_ROUNDS, errors, lost: lost.length, duplicates });
      expect(errors).toBe(0);
      expect(lost).toEqual([]);
      expect(duplicates).toBeGreaterThan(0);
    },
    ROW_TIMEOUT_MS
  );

  it(
    "a write with a guard keeps its conflict: one write of a new id wins",
    async (context) => {
      if (!failPoints) return context.skip();
      const versionOf = (item: Item): string => item.v;
      const [a, b] = pair({ versionOf });
      await warmed([a, b]);
      reset();
      let wins = 0;
      const codes: unknown[] = [];
      for (let round = 0; round < HELD_ROUNDS; round++) {
        const id = `guard${round}`;
        const settled = await raced([
          () => a.set(id, { v: "a" }, { expectedVersion: null }),
          () => b.set(id, { v: "b" }, { expectedVersion: null }),
        ]);
        wins += settled.filter((result) => result.status === "fulfilled").length;
        for (const failure of rejected(settled)) codes.push((failure.reason as { code?: unknown }).code);
      }
      printRow("held-guard", { rounds: HELD_ROUNDS, wins, codes, duplicates });
      expect(wins).toBe(HELD_ROUNDS);
      expect(codes).toEqual(Array.from({ length: HELD_ROUNDS }, () => "VERSION_CONFLICT"));
    },
    ROW_TIMEOUT_MS
  );

  it(
    "a patch that lost its document ends when another write puts it back",
    async (context) => {
      if (!failPoints) return context.skip();
      const collection = `first_${++next}`;
      const held: { hold?: () => Promise<void> } = {};
      // This Db runs the hold before each replace of the items, on the store that the row patches
      const heldDb = new Proxy(firstDb, {
        get(target, prop) {
          if (prop !== "collection") {
            const value = Reflect.get(target, prop, target) as unknown;
            return typeof value === "function" ? (value as (...given: unknown[]) => unknown).bind(target) : value;
          }
          return (name: string) => {
            const real = target.collection(name);
            if (name !== collection) return real;
            return new Proxy(real, {
              get(items, key) {
                const value = Reflect.get(items, key, items) as unknown;
                if (typeof value !== "function") return value;
                if (key !== "replaceOne") return (value as (...given: unknown[]) => unknown).bind(items);
                return async (...args: unknown[]) => {
                  const hold = held.hold;
                  held.hold = undefined;
                  if (!hold) return (value as (...given: unknown[]) => Promise<unknown>).apply(items, args);
                  return hold().then(() => (value as (...given: unknown[]) => Promise<unknown>).apply(items, args));
                };
              },
            });
          };
        },
      });
      const a = new MongoDocumentStorage<Item>({ collection, db: () => heldDb, transactions: "never" });
      const b = new MongoDocumentStorage<Item>({ collection, db: () => secondDb, transactions: "never" });
      await warmed([a, b]);
      reset();
      const admin = first.db("admin");
      const message = (error: unknown): string => String((error as Error).message).slice(0, 80);
      const patchErrors: string[] = [];
      const otherErrors: string[] = [];
      for (let round = 0; round < PATCH_ROUNDS; round++) {
        const id = `patched${round}`;
        await a.set(id, { v: "old" });
        let other: Promise<void> = Promise.resolve();
        let opened: Promise<unknown> = Promise.resolve();
        held.hold = async () => {
          // Between the read of the patch and its write, the document goes, and another process writes it
          await firstDb.collection(collection).deleteOne({ _id: id as never });
          const on = await admin.command({ configureFailPoint: FAIL_POINT, mode: "alwaysOn" });
          other = b.set(id, { v: "other" }).catch((error: unknown) => {
            otherErrors.push(message(error));
          });
          opened = admin
            .command({ waitForFailPoint: FAIL_POINT, timesEntered: (on["count"] as number) + 2, maxTimeMS: REACH_MS })
            .catch(() => undefined)
            .then(() => admin.command({ configureFailPoint: FAIL_POINT, mode: "off" }));
        };
        await a.patch(id, { v: "patch" }).catch((error: unknown) => {
          patchErrors.push(message(error));
        });
        await opened;
        await other;
      }
      printRow("held-patch", { rounds: PATCH_ROUNDS, patchErrors: patchErrors.length, otherErrors: otherErrors.length, duplicates, error: patchErrors[0] });
      expect(patchErrors).toEqual([]);
      expect(otherErrors).toEqual([]);
      expect(duplicates).toBeGreaterThan(0);
    },
    ROW_TIMEOUT_MS
  );

  it(
    "a real duplicate of the _id of another partition reaches the caller after one more try",
    async () => {
      const collection = `first_${++next}`;
      const root = new MongoDocumentStorage<Item>({ collection, db: () => firstDb, transactions: "never", form: SHARED_ID_FORM });
      const mine = root.forPartition("mine");
      const theirs = root.forPartition("theirs");
      await mine.set("taken", { v: "mine" });
      reset();
      const failure = await theirs.set("taken", { v: "theirs" }).catch((error: unknown) => error);
      printRow("real-other-partition", { duplicates, updates });
      expect((failure as { code?: unknown }).code).toBe(11000);
      expect(await mine.get("taken")).toEqual({ v: "mine" });
      expect(await theirs.has("taken")).toBe(false);
      expect(updates).toBeLessThanOrEqual(2);
    },
    ROW_TIMEOUT_MS
  );

  it(
    "a real duplicate on another unique index reaches the caller, and a long batch stops after one more try",
    async () => {
      const [a] = pair();
      const items = firstDb.collection(`first_${next}`);
      await a.set("before", { v: "first", mail: "taken" });
      await items.createIndex({ mail: 1 }, { unique: true, sparse: true });
      reset();
      const batch: Array<[string, Item]> = [
        ["clash", { v: "clash", mail: "taken" }],
        ...Array.from({ length: 50 }, (_, index): [string, Item] => [`after${index}`, { v: "after" }]),
      ];
      const failure = await a.setBatch(batch).catch((error: unknown) => error);
      printRow("real-unique-index", { duplicates, updates, size: batch.length });
      expect((failure as { code?: unknown }).code).toBe(11000);
      expect(await a.has("clash")).toBe(false);
      expect(updates).toBeLessThanOrEqual(2);
    },
    ROW_TIMEOUT_MS
  );

  it(
    "writes of different ids with the fail point have no duplicate key and no retry",
    async (context) => {
      if (!failPoints) return context.skip();
      const [a, b] = pair();
      await warmed([a, b]);
      reset();
      for (let round = 0; round < HELD_ROUNDS; round++) {
        const settled = await raced([() => a.set(`a${round}`, { v: "a" }), () => b.set(`b${round}`, { v: "b" })]);
        expect(rejected(settled)).toEqual([]);
      }
      printRow("held-no-fault", { rounds: HELD_ROUNDS, duplicates, updates });
      expect(duplicates).toBe(0);
    },
    ROW_TIMEOUT_MS
  );

  it(
    "two open writes of each new id end with no hold",
    async () => {
      const [a, b] = pair();
      await warmed([a, b]);
      reset();
      const errors: string[] = [];
      for (let round = 0; round < OPEN_ROUNDS; round++) {
        const settled = await Promise.allSettled([a.set(`open${round}`, { v: "a" }), b.set(`open${round}`, { v: "b" })]);
        for (const failure of rejected(settled)) errors.push(String((failure.reason as Error).message).slice(0, 80));
      }
      printRow("open", { rounds: OPEN_ROUNDS, errors: errors.length, duplicates, updates, error: errors[0] });
      expect(errors).toEqual([]);
    },
    ROW_TIMEOUT_MS
  );

  it(
    "the first write of a new collection from two stores ends: the counter documents",
    async () => {
      const errors: string[] = [];
      for (let round = 0; round < COUNTERS_ROUNDS; round++) {
        const [a, b] = pair();
        const settled = await Promise.allSettled([a.set("one", { v: "a" }), b.set("two", { v: "b" })]);
        for (const failure of rejected(settled)) errors.push(String((failure.reason as Error).message).slice(0, 80));
      }
      printRow("counters-pending", { rounds: COUNTERS_ROUNDS, errors: errors.length, error: errors[0] });
      expect(errors).toEqual([]);
    },
    ROW_TIMEOUT_MS
  );

  it(
    "the first write of a new collection in transactions ends: the counter document and one new id",
    async (context) => {
      const hello = await first.db("admin").command({ hello: 1 });
      if (typeof hello["setName"] !== "string") return context.skip();
      const errors: string[] = [];
      for (let round = 0; round < COUNTERS_ROUNDS; round++) {
        const [a, b] = pair({ transactions: "auto" });
        const settled = await Promise.allSettled([a.set("one", { v: "a" }), b.set("one", { v: "b" })]);
        for (const failure of rejected(settled)) errors.push(String((failure.reason as Error).message).slice(0, 80));
      }
      printRow("counters-transaction", { rounds: COUNTERS_ROUNDS, errors: errors.length, error: errors[0] });
      expect(errors).toEqual([]);
    },
    ROW_TIMEOUT_MS
  );

  it(
    "the plain store: two writes of one new id end, with the retry of the server",
    async (context) => {
      if (!failPoints) return context.skip();
      const collection = `first_${++next}`;
      setDefaultConnection({ getDb: () => firstDb, isConnected: () => true } as never);
      const a = new MongoStorage<Item>({ collection });
      const b = new MongoStorage<Item>({ collection });
      const errors: string[] = [];
      reset();
      for (let round = 0; round < HELD_ROUNDS; round++) {
        const settled = await raced([() => a.set(`plain${round}`, { v: "a" }), () => b.setBatch([[`plain${round}`, { v: "b" }]])]);
        for (const failure of rejected(settled)) errors.push(String((failure.reason as Error).message).slice(0, 80));
      }
      printRow("held-plain-store", { rounds: HELD_ROUNDS, errors: errors.length, duplicates, updates, error: errors[0] });
      expect(errors).toEqual([]);
    },
    ROW_TIMEOUT_MS
  );
});
