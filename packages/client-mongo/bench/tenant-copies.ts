/**
 * The suite `tenant-separate` has three copies of the store. One has no write queue in a process, one has many
 * counters, and one has both. A copy comes from the source of this tree, so the arms follow the code. A text that
 * a copy does not find stops the job, and `tenant-copies.test.ts` finds it before a run. The copies are only for this bench.
 */

import type { SEPARATE_ARMS } from "./tenant-cases.js";

/** This function changes one text of the source, and stops when the source does not have this text one time. */
export function swap(text: string, from: string, to: string): string {
  if (text.split(from).length !== 2) throw new RangeError(`the source does not have this text one time: ${from}`);
  return text.replace(from, () => to);
}

/** The head of the write queue of a process in the source. */
const WRITE_QUEUE = "function enqueueWrite<R>(db: Db, name: string, task: () => Promise<R>): Promise<R> {\n";

/** This function gives a copy of the store with no write queue in a process. */
export const noQueue = (text: string): string => swap(text, WRITE_QUEUE, `${WRITE_QUEUE}  if (db) return task();\n`);

/** The id of the counter in the source: the collection name on main, and the counter id with a counter for each partition (CLI-96). */
const COUNTER_IDS = ["this.collectionName", "this.counterId"] as const;

/** This function gives the update of the counter in the source, with one id of `COUNTER_IDS`. */
const counterUpdate = (id: string): string =>
  `{ _id: ${id} },\n            { $inc: { seq: count }, $setOnInsert: { epoch: randomUUID() } },\n            { upsert: true, returnDocument: "after", session }`;

/**
 * This function gives a copy of the store with 1,000 counter documents and a random pick for each write. A number is
 * unique only inside its counter here. A write does not read the numbers, and no index is unique on them.
 */
export function manyCounters(text: string): string {
  const id = COUNTER_IDS.find((name) => text.includes(counterUpdate(name))) ?? COUNTER_IDS[0];
  const counter = counterUpdate(id);
  const spread = "{ _id: `${" + id + "}:${Math.floor(Math.random() * 1000)}` }";
  return swap(text, counter, counter.replace(`{ _id: ${id} }`, () => spread));
}

/** This function gives the text of each copy of the store. */
export function copiesOf(text: string): Record<(typeof SEPARATE_ARMS)[number], string> {
  return { noqueue: noQueue(text), many: manyCounters(text), neither: manyCounters(noQueue(text)) };
}
