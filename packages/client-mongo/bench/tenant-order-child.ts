/**
 * One child of the suite `tenant-order` (roadmap CLI-96): `--copy <copy> --database <name>`.
 * It starts several writes of one id with no wait between them, for many ids, once on new ids and once on existing ids. The last write started must give the value that stays.
 * It prints the count of ids whose stored value is not the last value, and one error of each kind.
 */

import { parseArgs } from "node:util";
import { MongoClient } from "mongodb";
import { ORDER_IDS, ORDER_WRITES } from "./tenant-order-cases.js";

const { values } = parseArgs({ options: { copy: { type: "string" }, database: { type: "string" } } });
const { copy, database } = values;
const url = process.env["MONGO_TEST_URL"];
if (!copy || !database || !url) throw new RangeError("this child needs --copy, --database and MONGO_TEST_URL");

const { MongoDocumentStorage: Storage } = (await import(`../src/storage/document-storage.${copy}.ts`)) as typeof import("../src/storage/document-storage.js");
const client = await MongoClient.connect(url);
const db = client.db(database);
const store = new Storage<{ last: number }>({ collection: "docs", partition: "p0", db: () => db, client: () => client });

const errors: Record<string, string> = {};
const counts: Record<string, number> = {};
const ids = Array.from({ length: ORDER_IDS }, (_, index) => `id-${String(index)}`);

/** This function starts each write of each id in order, waits for all, and counts the ids that do not hold the last value. */
async function pass(base: number): Promise<{ wrong: number; absent: number; examples: string[] }> {
  const writes: Array<Promise<void>> = [];
  for (let write = 0; write < ORDER_WRITES; write++) for (const id of ids) writes.push(store.set(id, { last: base + write }));
  const ended = await Promise.allSettled(writes);
  for (const one of ended) {
    if (one.status === "fulfilled") continue;
    const text = (one.reason instanceof Error ? one.reason.message : String(one.reason)).slice(0, 200);
    const kind = text.replace(/\d+/g, "N");
    errors[kind] = text;
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  const stored = await store.getBatch(ids);
  const last = base + ORDER_WRITES - 1;
  const wrong = ids.filter((id) => stored.has(id) && stored.get(id)?.last !== last);
  return { wrong: wrong.length, absent: ids.filter((id) => !stored.has(id)).length, examples: wrong.slice(0, 3).map((id) => `${id}=${String(stored.get(id)?.last)}`) };
}

const newIds = await pass(0);
const existingIds = await pass(ORDER_WRITES);
await client.close();
process.stdout.write(`${JSON.stringify({ newIds, existingIds, errors, counts })}\n`, () => process.exit(0));
