/**
 * The rate of a moved mark under load (roadmap CLI-102). A full answer takes a second mark after its
 * list. When writes land during the list, the mark moves, and the answer reads the rows between the two
 * marks. That read is bounded at the second mark W.
 *
 * Each row writes with 3 stores at full speed and reads full answers with a fourth store, for a fixed
 * time. The row counts the full answers and the answers with a moved mark. It also counts the moved
 * answers with a row past W at the read between the marks. That last count tells how often the bound at W does work under
 * load. The row also gives the share of the time of a full answer that the second mark and its reads take.
 *
 * Each row prints a line `mark-moved {json}`. The rows assert only that the row did work. They are a
 * measure, and not a gate.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, type Db, type Document, type Filter } from "mongodb";
import { quantile } from "@mark1russell7/rigor-statistics";
import { MongoDocumentStorage } from "./document-storage.js";

const url = process.env["MONGO_TEST_URL"];

const SIZES = [100, 1_000, 10_000] as const;
const WRITERS = 3;
const LOAD_MS = 4_000;
const SEED_BATCH = 1_000;
const ROW_TIMEOUT_MS = 120_000;
const DATABASE = `mark_moved_${process.pid}`;

type Item = { v: number; at: number };
type StorePath = "transaction" | "pending";

/** One command of the reader: its kind and its time. */
type Step = { kind: "mark" | "list" | "between" | "floor"; ms: number };

/** The record of one full answer: its steps, and the count of rows past W at the read between the marks. */
type Answer = { steps: Step[]; pastW: number[] };

let current: Answer | undefined;

/** This function times a promise into the current answer. */
async function timed<R>(kind: Step["kind"], work: () => Promise<R>): Promise<R> {
  const from = performance.now();
  try {
    return await work();
  } finally {
    current?.steps.push({ kind, ms: performance.now() - from });
  }
}

/** This function gives a cursor whose `toArray` is timed as `kind`, and then runs `after` with the rows. */
function timedCursor(cursor: object, kind: (sorted: boolean) => Step["kind"], after: (sorted: boolean) => Promise<void>, sorted = false): object {
  return new Proxy(cursor, {
    get(target, key) {
      const value = Reflect.get(target, key, target) as unknown;
      if (typeof value !== "function") return value;
      const method = value as (...given: unknown[]) => unknown;
      if (key === "sort") return (...args: unknown[]) => timedCursor(method.apply(target, args) as object, kind, after, true);
      if (key === "toArray") {
        return async () => {
          const rows = await timed(kind(sorted), async () => (await method.apply(target, [])) as unknown);
          await after(sorted);
          return rows;
        };
      }
      return method.bind(target);
    },
  });
}

/**
 * This function gives a `Db` that times the commands of the reader. After each read between the two
 * marks, it counts the rows past W with a query of its own, which is not timed.
 */
function readerDb(db: Db, collection: string, counters: string): Db {
  return new Proxy(db, {
    get(target, prop) {
      if (prop !== "collection") {
        const value = Reflect.get(target, prop, target) as unknown;
        return typeof value === "function" ? (value as (...given: unknown[]) => unknown).bind(target) : value;
      }
      return (name: string) => {
        const real = target.collection(name);
        if (name !== collection && name !== counters) return real;
        return new Proxy(real, {
          get(items, key) {
            const value = Reflect.get(items, key, items) as unknown;
            if (typeof value !== "function") return value;
            const method = value as (...given: unknown[]) => unknown;
            if (name === counters && key === "aggregate") {
              return (...args: unknown[]) => timedCursor(method.apply(items, args) as object, () => "mark", async () => undefined);
            }
            if (name === counters && key === "findOne") return (...args: unknown[]) => timed("floor", async () => (await method.apply(items, args)) as unknown);
            if (name === collection && key === "find") {
              return (...args: unknown[]) => {
                const filter = args[0] as Document;
                const range = filter["_seq"] as { $gt?: number; $lte?: number } | undefined;
                const cursor = method.apply(items, args) as object;
                if (range?.$lte === undefined) return timedCursor(cursor, () => "list", async () => undefined);
                return timedCursor(
                  cursor,
                  () => "between",
                  async () => {
                    const past = await real.countDocuments({ ...filter, _seq: { $gt: range.$lte } } as Filter<Document>);
                    current?.pastW.push(past);
                  },
                );
              };
            }
            return method.bind(items);
          },
        });
      };
    },
  });
}

/** The counts of one row. */
type Row = {
  name: string;
  size: number;
  writes: number;
  writesPerSecond: number;
  fulls: number;
  moved: number;
  movedShare: number;
  pastW: number;
  pastWShare: number;
  tries: Record<string, number>;
  medianFullMs: number;
  medianExtraMs: number;
  extraShare: number;
};

describe.runIf(url)("the rate of a moved mark under load (CLI-102)", () => {
  const clients: MongoClient[] = [];
  let replicaSet = false;
  let next = 0;

  beforeAll(async () => {
    for (let n = 0; n <= WRITERS; n += 1) {
      const client = new MongoClient(url!);
      await client.connect();
      clients.push(client);
    }
    replicaSet = typeof (await clients[0]!.db("admin").command({ hello: 1 }))["setName"] === "string";
  });

  afterAll(async () => {
    await clients[0]?.db(DATABASE).dropDatabase();
    await Promise.all(clients.map((client) => client.close()));
  });

  function storeOf(path: StorePath, client: MongoClient, collection: string, db?: Db): MongoDocumentStorage<Item> {
    const given = db ?? client.db(DATABASE);
    return new MongoDocumentStorage<Item>({
      collection,
      db: () => given,
      client: () => client,
      ...(path === "pending" ? { transactions: "never" as const } : {}),
    });
  }

  async function loadRow(path: StorePath, size: number): Promise<Row> {
    const collection = `moved${++next}`;
    const writers = clients.slice(1).map((client) => storeOf(path, client, collection));
    for (let from = 0; from < size; from += SEED_BATCH) {
      const batch: Array<[string, Item]> = [];
      for (let n = from; n < Math.min(size, from + SEED_BATCH); n += 1) batch.push([`i${n}`, { v: 0, at: n }]);
      await writers[0]!.setBatch(batch);
    }
    const counters = "__storage_counters";
    const reader = storeOf(path, clients[0]!, collection, readerDb(clients[0]!.db(DATABASE), collection, counters));
    await reader.getChangesSince();

    let writes = 0;
    let stop = false;
    const loops = writers.map(async (store, index) => {
      let n = 0;
      while (!stop) {
        n += 1;
        // Each writer takes its own ids, so the transaction path has no write conflicts
        await store.set(`i${(n * WRITERS + index) % size}`, { v: n, at: index });
        writes += 1;
      }
    });
    const answers: Answer[] = [];
    const from = performance.now();
    while (performance.now() - from < LOAD_MS) {
      current = { steps: [], pastW: [] };
      const result = await reader.getChangesSince();
      expect(result.full).toBe(true);
      answers.push(current);
    }
    current = undefined;
    const elapsedMs = performance.now() - from;
    stop = true;
    await Promise.all(loops);

    const moved = answers.filter((answer) => answer.pastW.length > 0);
    const pastW = moved.filter((answer) => answer.pastW.some((count) => count > 0)).length;
    const tries: Record<string, number> = {};
    for (const answer of answers) {
      const lists = String(answer.steps.filter((step) => step.kind === "list").length);
      tries[lists] = (tries[lists] ?? 0) + 1;
    }
    const total = (answer: Answer): number => answer.steps.reduce((sum, step) => sum + step.ms, 0);
    // The first mark and the first list are the cost of a full answer with one mark. Each other step is the cost of the second mark
    const extra = (answer: Answer): number => {
      const firstMark = answer.steps.findIndex((step) => step.kind === "mark");
      const firstList = answer.steps.findIndex((step) => step.kind === "list");
      return total(answer) - (answer.steps[firstMark]?.ms ?? 0) - (answer.steps[firstList]?.ms ?? 0);
    };
    const fullMs = answers.map(total);
    const extraMs = answers.map(extra);
    const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);
    const round = (value: number, places = 3): number => Number(value.toFixed(places));
    return {
      name: `${path}-${size}`,
      size,
      writes,
      writesPerSecond: round((writes * 1000) / elapsedMs, 0),
      fulls: answers.length,
      moved: moved.length,
      movedShare: round(moved.length / answers.length),
      pastW,
      pastWShare: moved.length === 0 ? 0 : round(pastW / moved.length),
      tries,
      medianFullMs: round(quantile(fullMs, 0.5), 2),
      medianExtraMs: round(quantile(extraMs, 0.5), 2),
      extraShare: round(sum(extraMs) / sum(fullMs)),
    };
  }

  it.for(["pending", "transaction"] as const)("full answers under 3 writers at each list size: %s path", { timeout: ROW_TIMEOUT_MS * SIZES.length }, async (path, context) => {
    if (path === "transaction" && !replicaSet) return context.skip?.("the path needs a replica set");
    for (const size of SIZES) {
      const row = await loadRow(path, size);
      console.log(`mark-moved ${JSON.stringify(row)}`);
      expect(row.writes).toBeGreaterThan(0);
      expect(row.fulls).toBeGreaterThan(0);
    }
  });
});
