/**
 * The copies of the store for the suite `tenant-separate`: one with the write queue of a process off, one with many
 * counters, and one with both. A copy comes from the source of this tree, so the arms follow the code. A text that
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

/** The update of the counter of the numbers in the source. */
const COUNTER = '{ _id: this.counterId },\n            { $inc: { seq: count }, $setOnInsert: { epoch: randomUUID() } },\n            { upsert: true, returnDocument: "after", session }';

/**
 * This function gives a copy of the store with 1,000 counter documents and a random pick for each write. A number is
 * unique only inside its counter here. A write does not read the numbers, and no index is unique on them.
 */
export const manyCounters = (text: string): string =>
  swap(text, COUNTER, COUNTER.replace("{ _id: this.counterId }", "{ _id: `${this.counterId}:${Math.floor(Math.random() * 1000)}` }"));

/** This function gives the text of each copy of the store. */
export function copiesOf(text: string): Record<(typeof SEPARATE_ARMS)[number], string> {
  return { noqueue: noQueue(text), many: manyCounters(text), neither: manyCounters(noQueue(text)) };
}
