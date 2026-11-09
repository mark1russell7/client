/**
 * The cost of one write of `MongoDocumentStorage` on each path of the numbers (roadmap CLI-96). A set of a new id
 * and a rewrite send a fixed list of commands. The list is a read of the places, a counter number, the write, and
 * the commit or the release. These rows count the commands and the transactions of each set with the command events of
 * the driver. A change of the cost of a write fails here, not in a bench probe.
 *
 * The option `sequence: "partition"` changes the counter document and the write queue, not the commands. So both
 * sequences have the same cost for each set.
 *
 * These rows need `MONGO_TEST_URL` (CI starts a `mongo:7` service).
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoClient, type CommandFailedEvent, type CommandStartedEvent, type CommandSucceededEvent, type Db } from "mongodb";
import { DEFAULT_WRITES_IN_FLIGHT, MongoDocumentStorage, UNBOUNDED_PARTITION_WARNING } from "./document-storage.js";

const url = process.env["MONGO_TEST_URL"];
const withMongo = url ? describe : describe.skip;

/** The sets of new ids and the rewrites of each row, after a first set that makes the counter and the floor. */
const WRITES = 10;

let client: MongoClient | undefined;
let db: Db;
let replicaSet = false;
let next = 0;
const started: CommandStartedEvent[] = [];
/** The transactions that are open at this time, and the most at one time since the last clear. */
const open = { now: 0, most: 0 };

const noteStart = (event: CommandStartedEvent): void => {
  if ((event.command as { startTransaction?: boolean }).startTransaction !== true) return;
  open.now += 1;
  open.most = Math.max(open.most, open.now);
};
const noteEnd = (event: CommandSucceededEvent | CommandFailedEvent): void => {
  if (event.commandName === "commitTransaction" || event.commandName === "abortTransaction") open.now -= 1;
};

beforeAll(async () => {
  if (!url) return;
  client = new MongoClient(url, { monitorCommands: true });
  client.on("commandStarted", (event) => {
    started.push(event);
    noteStart(event);
  });
  client.on("commandSucceeded", noteEnd);
  client.on("commandFailed", noteEnd);
  await client.connect();
  db = client.db(`client_mongo_write_cost_${process.pid}_${Date.now()}`);
  replicaSet = typeof (await client.db("admin").command({ hello: 1 }))["setName"] === "string";
});

afterAll(async () => {
  if (!client) return;
  await db.dropDatabase();
  await client.close();
});

/** The commands of each set, by name, and the transactions of each set. */
type CostPerSet = Record<string, number>;

/** This function gives the commands and the transactions of each set, from the command events since the last clear. */
function costPerSet(events: readonly CommandStartedEvent[], sets: number): CostPerSet {
  const cost: CostPerSet = { transactions: 0 };
  for (const event of events) {
    cost[event.commandName] = (cost[event.commandName] ?? 0) + 1;
    if ((event.command as { startTransaction?: boolean }).startTransaction === true) cost["transactions"]! += 1;
  }
  return Object.fromEntries(Object.entries(cost).map(([name, count]) => [name, count / sets]));
}

/** The cost of each set on a replica set: one transaction with the number and the write, and its commit. */
const TRANSACTION_COST: CostPerSet = { find: 1, findAndModify: 1, update: 1, commitTransaction: 1, transactions: 1 };

/** The cost of each set on a single server: a pending number, the write, and the release of the number. */
const PENDING_COST: CostPerSet = { find: 1, findAndModify: 2, update: 1, transactions: 0 };

withMongo("the commands and the transactions of one write (CLI-96)", () => {
  it.each(["collection", "partition"] as const)("a set of a new id and a rewrite have a fixed cost: sequence %s", async (sequence) => {
    const store = new MongoDocumentStorage<{ v: string }>({ collection: `w${++next}`, db: () => db, client: () => client!, partition: "t1", sequence });
    await store.set("first", { v: "0" });
    started.length = 0;
    for (let index = 0; index < WRITES; index += 1) await store.set(`n${index}`, { v: `new${index}` });
    const newIds = costPerSet(started, WRITES);
    started.length = 0;
    for (let index = 0; index < WRITES; index += 1) await store.set(`n${index}`, { v: `again${index}` });
    const rewrites = costPerSet(started, WRITES);
    console.log(`write cost ${JSON.stringify({ sequence, replicaSet, newIds, rewrites })}`);
    const expected = replicaSet ? TRANSACTION_COST : PENDING_COST;
    expect(newIds).toEqual(expected);
    expect(rewrites).toEqual(expected);
  });
});

describe("the option writesInFlight (CLI-96)", () => {
  it("refuses a bound that is not a whole number of 1 or more, or Infinity", () => {
    for (const bad of [0, -1, 2.5, Number.NaN]) {
      expect(() => new MongoDocumentStorage({ collection: "c", writesInFlight: bad })).toThrow(RangeError);
    }
    expect(() => new MongoDocumentStorage({ collection: "c", writesInFlight: Infinity })).not.toThrow();
  });

  it("keeps the default bound at 8, the value that the sweeps at 400-p2 and 4000-p2 chose", () => {
    expect(DEFAULT_WRITES_IN_FLIGHT).toBe(8);
  });

  it("emits one process warning for a store with sequence partition and no bound", () => {
    const emit = vi.spyOn(process, "emitWarning").mockImplementation(() => undefined);
    try {
      new MongoDocumentStorage({ collection: "c", writesInFlight: Infinity });
      new MongoDocumentStorage({ collection: "c", sequence: "partition" });
      expect(emit).not.toHaveBeenCalled();
      new MongoDocumentStorage({ collection: "p", sequence: "partition", writesInFlight: Infinity });
      new MongoDocumentStorage({ collection: "p", sequence: "partition", writesInFlight: Infinity });
      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit.mock.calls[0]?.[1]).toEqual({ code: UNBOUNDED_PARTITION_WARNING });
    } finally {
      emit.mockRestore();
    }
  });
});

withMongo("the bound of the writes in flight of a client (CLI-96)", () => {
  /** This function writes one set in each of 24 partitions at once, and gives the most transactions open at one time. */
  async function mostOpen(writesInFlight: number): Promise<number> {
    const collection = `b${++next}`;
    const stores = Array.from({ length: 24 }, (_, index) =>
      new MongoDocumentStorage<{ v: string }>({ collection, db: () => db, client: () => client!, partition: `t${index}`, sequence: "partition", writesInFlight })
    );
    // The first set of each partition makes its counter and its floor, before the count
    await Promise.all(stores.map((store) => store.set("first", { v: "0" })));
    open.now = 0;
    open.most = 0;
    await Promise.all(stores.flatMap((store) => [0, 1, 2].map((index) => store.set(`n${index}`, { v: `${index}` }))));
    expect(open.now).toBe(0);
    return open.most;
  }

  it("keeps the open transactions of the partitions of one client at most at the bound", async () => {
    // A single server has no transactions: these rows read only a replica set, which CI starts
    if (!replicaSet) return;
    expect(await mostOpen(3)).toBeLessThanOrEqual(3);
    expect(await mostOpen(1)).toBe(1);
    // Without a bound, the partitions open more transactions at once than the bound of 3: so the count sees the bound
    expect(await mostOpen(Infinity)).toBeGreaterThan(3);
  });
});
