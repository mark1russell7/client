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

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, type CommandStartedEvent, type Db } from "mongodb";
import { MongoDocumentStorage } from "./document-storage.js";

const url = process.env["MONGO_TEST_URL"];
const withMongo = url ? describe : describe.skip;

/** The sets of new ids and the rewrites of each row, after a first set that makes the counter and the floor. */
const WRITES = 10;

let client: MongoClient | undefined;
let db: Db;
let replicaSet = false;
let next = 0;
const started: CommandStartedEvent[] = [];

beforeAll(async () => {
  if (!url) return;
  client = new MongoClient(url, { monitorCommands: true });
  client.on("commandStarted", (event) => started.push(event));
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
