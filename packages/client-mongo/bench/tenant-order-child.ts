/**
 * One child of the suite `tenant-order` (roadmap CLI-96): `--copy <copy> --database <name>`.
 * It starts several writes of one id with no wait between them, for many ids, once on new ids and once on existing ids. The last write started must give the value that stays.
 * A held pass then starts two writes of one id, and holds the first write before its write of the items until the second write ends or the time `ORDER_HELD_MS` ends.
 * It prints the count of ids whose stored value is not the last value, and one error of each kind.
 */

import { parseArgs } from "node:util";
import { MongoClient, type Db } from "mongodb";
import { ORDER_HELD_IDS, ORDER_HELD_MS, ORDER_IDS, ORDER_WRITES } from "./tenant-order-cases.js";

const { values } = parseArgs({ options: { copy: { type: "string" }, database: { type: "string" } } });
const { copy, database } = values;
const url = process.env["MONGO_TEST_URL"];
if (!copy || !database || !url) throw new RangeError("this child needs --copy, --database and MONGO_TEST_URL");

const { MongoDocumentStorage: Storage } = (await import(`../src/storage/document-storage.${copy}.ts`)) as typeof import("../src/storage/document-storage.js");
const client = await MongoClient.connect(url);
const plainDb = client.db(database);

/** The next write of the items stops at this hold. */
let nextHold: { reached: () => void; opened: Promise<void> } | undefined;

/** This database stops the next write of the items at `nextHold`. Each other call goes to the real database. */
const db = new Proxy(plainDb, {
  get(target, key) {
    if (key === "collection") {
      return (name: string): unknown => {
        const items = target.collection(name);
        if (name !== "docs") return items;
        const bulkWrite = items.bulkWrite.bind(items) as (...args: unknown[]) => Promise<unknown>;
        return Object.assign(items, {
          bulkWrite: async (...args: unknown[]) => {
            const hold = nextHold;
            nextHold = undefined;
            if (hold) {
              hold.reached();
              await hold.opened;
            }
            return bulkWrite(...args);
          },
        });
      };
    }
    const value: unknown = Reflect.get(target, key);
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
  },
}) as Db;

const store = new Storage<{ last: number }>({ collection: "docs", partition: "p0", db: () => db, client: () => client });

const errors: Record<string, string> = {};
const counts: Record<string, number> = {};
const ids = Array.from({ length: ORDER_IDS }, (_, index) => `id-${String(index)}`);

/** This function keeps one error of each kind. */
function keepErrors(ended: ReadonlyArray<PromiseSettledResult<void>>): void {
  for (const one of ended) {
    if (one.status === "fulfilled") continue;
    const text = (one.reason instanceof Error ? one.reason.message : String(one.reason)).slice(0, 200);
    const kind = text.replace(/\d+/g, "N");
    errors[kind] = text;
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
}

/** This function starts each write of each id in order, waits for all, and counts the ids that do not hold the last value. */
async function pass(base: number): Promise<{ wrong: number; absent: number; examples: string[] }> {
  const writes: Array<Promise<void>> = [];
  for (let write = 0; write < ORDER_WRITES; write++) for (const id of ids) writes.push(store.set(id, { last: base + write }));
  keepErrors(await Promise.allSettled(writes));
  const stored = await store.getBatch(ids);
  const last = base + ORDER_WRITES - 1;
  const wrong = ids.filter((id) => stored.has(id) && stored.get(id)?.last !== last);
  return { wrong: wrong.length, absent: ids.filter((id) => !stored.has(id)).length, examples: wrong.slice(0, 3).map((id) => `${id}=${String(stored.get(id)?.last)}`) };
}

/** This function writes each id two times, holds the first write of each id, and counts the ids that do not hold the second value. */
async function heldPass(base: number): Promise<{ wrong: number; absent: number; examples: string[] }> {
  const heldIds = Array.from({ length: ORDER_HELD_IDS }, (_, index) => `held-${String(index)}`);
  for (const id of heldIds) {
    let reached = (): void => undefined;
    let open = (): void => undefined;
    const atHold = new Promise<void>((resolve) => (reached = resolve));
    const opened = new Promise<void>((resolve) => (open = resolve));
    nextHold = { reached, opened };
    const first = store.set(id, { last: base });
    await atHold;
    const second = store.set(id, { last: base + 1 });
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([second.then(() => undefined, () => undefined), new Promise<void>((resolve) => (timer = setTimeout(resolve, ORDER_HELD_MS)))]);
    clearTimeout(timer);
    open();
    keepErrors(await Promise.allSettled([first, second]));
  }
  const stored = await store.getBatch(heldIds);
  const wrong = heldIds.filter((id) => stored.has(id) && stored.get(id)?.last !== base + 1);
  return { wrong: wrong.length, absent: heldIds.filter((id) => !stored.has(id)).length, examples: wrong.slice(0, 3).map((id) => `${id}=${String(stored.get(id)?.last)}`) };
}

const newIds = await pass(0);
const existingIds = await pass(ORDER_WRITES);
const heldNew = await heldPass(100);
const heldExisting = await heldPass(200);
await client.close();
process.stdout.write(`${JSON.stringify({ newIds, existingIds, heldNew, heldExisting, errors, counts })}\n`, () => process.exit(0));
