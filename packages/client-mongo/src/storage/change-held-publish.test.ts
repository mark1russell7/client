/**
 * The wait of a subscriber for a write that a write in flight holds back (roadmap CLI-102). On the
 * path of pending numbers, a read stops below the lowest number in flight. Write B on another process
 * holds a number and does not end. Write A on this process takes the next number and ends. The publish
 * of A then reads no change. With no other write on this process, the subscriber must still get A.
 *
 * Each row prints its wait and its reads on a line `held {json}`. The limit of a row is the time that
 * the test waits. It is not a claim of speed.
 *
 * These rows need `MONGO_TEST_URL`.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, type Db } from "mongodb";
import {
  callerOf,
  collectionChangeTopic,
  createCollectionProcedures,
  createEventBus,
  ms,
  type CallerOptions,
  type CollectionChangeEvent,
  type StorageChanges,
} from "@procedures/client";
import { MongoDocumentStorage } from "./document-storage.js";

interface Item {
  readonly v: string;
}

const NAME = "held";
const TOPIC = collectionChangeTopic(NAME);
const PATH = ["collections", NAME] as const;
const call = callerOf({ procedures: createCollectionProcedures(NAME) });

const url = process.env["MONGO_TEST_URL"];
const withMongo = url ? describe : describe.skip;

/** The time that a row waits for its event. It is longer than the longest wait between two reads. */
const LIMIT_MS = 10_000;
const ROW_TIMEOUT_MS = 40_000;
/** The time of a hold of write B, in the rows that end the hold. */
const HOLD_MS = 2_000;
/** The lease of the row that does not end the hold. */
const SHORT_LEASE_MS = 300;
/** The most reads in a hold of `HOLD_MS`, from waits that start at 100 ms and double. */
const MOST_REREADS = 6;
/** The time after a reply in which the row with no fault looks for a read. */
const QUIET_MS = 500;
const POLL_MS = 20;

const sleep = (time: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, time));

/** This function prints the record of a row, for the job log and the record of the item. */
function printRow(name: string, record: Record<string, unknown>): void {
  console.log(`held ${JSON.stringify({ name, ...record })}`);
}

/** This function gives the time until the condition is true, or undefined at the limit. */
async function waited(condition: () => boolean): Promise<number | undefined> {
  const start = Date.now();
  while (Date.now() - start < LIMIT_MS) {
    if (condition()) return Date.now() - start;
    await sleep(POLL_MS);
  }
  return undefined;
}

/** A hold that stops a write before its write of the items, until the test opens it. */
function gate(): { hold: () => Promise<void>; reached: Promise<void>; open: () => void } {
  let open: () => void = () => undefined;
  let reach: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => (open = resolve));
  const reached = new Promise<void>((resolve) => (reach = resolve));
  return {
    hold: async () => {
      reach();
      await opened;
    },
    reached,
    open: () => open(),
  };
}

/** This function gives a `Db` that waits for the hold before each bulk write of a collection. */
function heldDb(db: Db, collection: string, hold: () => Promise<void>): Db {
  return new Proxy(db, {
    get(target, prop) {
      if (prop === "collection") {
        return (name: string) => {
          const real = target.collection(name);
          if (name !== collection) return real;
          return new Proxy(real, {
            get(items, key) {
              const value = Reflect.get(items, key, items) as unknown;
              if (key === "bulkWrite") {
                return async (...args: unknown[]) => {
                  await hold();
                  return (value as (...given: unknown[]) => Promise<unknown>).apply(items, args);
                };
              }
              return typeof value === "function" ? (value as (...given: unknown[]) => unknown).bind(items) : value;
            },
          });
        };
      }
      const value = Reflect.get(target, prop, target) as unknown;
      return typeof value === "function" ? (value as (...given: unknown[]) => unknown).bind(target) : value;
    },
  });
}

/** One process of a row: a store behind the procedures, a bus, its events and a count of its reads. */
class Host {
  readonly bus = createEventBus();
  readonly events: CollectionChangeEvent[] = [];
  reads = 0;
  readonly store: MongoDocumentStorage<Item>;
  private readonly options: CallerOptions;

  constructor(store: MongoDocumentStorage<Item>) {
    this.store = store;
    const real = store.getChangesSince.bind(store);
    store.getChangesSince = (since?: string): Promise<StorageChanges<Item>> => {
      this.reads += 1;
      return real(since);
    };
    const repository = { getStorage: () => store, hasCollection: () => true };
    this.options = { repository, bus: this.bus } as unknown as CallerOptions;
    this.bus.on<CollectionChangeEvent>(TOPIC, (event) => void this.events.push(event));
  }

  write(id: string): Promise<unknown> {
    return call([...PATH, "set"], { id, value: { v: id } }, this.options);
  }

  changes(since?: string): Promise<{ version: string }> {
    return call([...PATH, "changes"], since === undefined ? {} : { since }, this.options);
  }

  /** This method tells if an event of this host has the id. */
  told(id: string): boolean {
    return this.events.some((event) => event.changed.includes(id));
  }
}

withMongo("the wait of a subscriber for a write held back by a write in flight (CLI-102)", { timeout: ROW_TIMEOUT_MS }, () => {
  const database = `held_test_${process.pid}`;
  let clientA: MongoClient;
  let clientB: MongoClient;
  let next = 0;

  beforeAll(async () => {
    clientA = await new MongoClient(url!).connect();
    clientB = await new MongoClient(url!).connect();
  });

  afterAll(async () => {
    await clientA.db(database).dropDatabase();
    await Promise.all([clientA.close(), clientB.close()]);
  });

  /** This function makes host A and the store of B on a new collection, with the hold on B. */
  function pair(lease?: number): { a: Host; storeB: MongoDocumentStorage<Item>; stopped: ReturnType<typeof gate> } {
    const collection = `held${++next}`;
    const stopped = gate();
    const held = heldDb(clientB.db(database), collection, stopped.hold);
    const shared = { collection, transactions: "never" as const, ...(lease === undefined ? {} : { writeLease: ms(lease) }) };
    const storeA = new MongoDocumentStorage<Item>({ ...shared, db: () => clientA.db(database), client: () => clientA });
    const storeB = new MongoDocumentStorage<Item>({ ...shared, db: () => held, client: () => clientB });
    return { a: new Host(storeA), storeB, stopped };
  }

  it("a write held back reaches its subscriber after the hold ends, with no later write", async () => {
    const { a, storeB, stopped } = pair();
    await a.changes();
    const writeB = storeB.set("b", { v: "b" });
    await stopped.reached;
    await a.write("a");
    expect(a.told("a")).toBe(false);
    const before = a.reads;
    await sleep(HOLD_MS);
    const rereads = a.reads - before;
    stopped.open();
    await writeB;
    const wait = await waited(() => a.told("a"));
    printRow("held-after-hold", { holdMs: HOLD_MS, waitMs: wait ?? null, limitMs: LIMIT_MS, rereads });
    expect(wait).toBeDefined();
    expect(rereads).toBeLessThanOrEqual(MOST_REREADS);
  });

  it("a write held back by a write that does not end reaches its subscriber after the lease", async () => {
    const { a, storeB, stopped } = pair(SHORT_LEASE_MS);
    await a.changes();
    const writeB = storeB.set("b", { v: "b" });
    await stopped.reached;
    await a.write("a");
    const wait = await waited(() => a.told("a"));
    printRow("held-by-lease", { leaseMs: SHORT_LEASE_MS, waitMs: wait ?? null, limitMs: LIMIT_MS });
    stopped.open();
    await writeB;
    expect(wait).toBeDefined();
  });

  it("a read of a subscriber in a hold makes the next event, for a write outside the procedures", async () => {
    const { a, storeB, stopped } = pair();
    const { version } = await a.changes();
    const writeB = storeB.set("b", { v: "b" });
    await stopped.reached;
    await a.store.set("a", { v: "a" });
    await a.changes(version);
    stopped.open();
    await writeB;
    const wait = await waited(() => a.told("a"));
    printRow("held-pull", { waitMs: wait ?? null, limitMs: LIMIT_MS });
    expect(wait).toBeDefined();
  });

  it("with no write in flight, the event comes before the reply, and no read follows it", async () => {
    const { a } = pair();
    await a.changes();
    await a.write("a");
    expect(a.told("a")).toBe(true);
    const before = a.reads;
    await sleep(QUIET_MS);
    printRow("held-no-fault", { rereads: a.reads - before, afterMs: QUIET_MS });
    expect(a.reads).toBe(before);
  });
});
