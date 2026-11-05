/**
 * One job of the suite `tenant-separate`. It writes three copies of the store next to the source: one with the queue of a
 * process off, one with many counters, and one with both. A copy comes from the source of this tree, so the arms
 * follow the code. A text that this script does not find stops the job. The copies are only for this bench.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { SEPARATE_ARMS, SEPARATE_CASES } from "./tenant-cases.js";
import { runTenantJob } from "./tenant-job.js";

const source = new URL("../src/storage/document-storage.ts", import.meta.url);

/** This function changes one text of the source, and stops when the source does not have this text one time. */
function swap(text: string, from: string, to: string): string {
  if (text.split(from).length !== 2) throw new RangeError(`the source does not have this text one time: ${from}`);
  return text.replace(from, () => to);
}

const noQueue = (text: string): string =>
  swap(text, "function enqueue<R>(db: Db, name: string, task: () => Promise<R>): Promise<R> {\n", "function enqueue<R>(db: Db, name: string, task: () => Promise<R>): Promise<R> {\n  if (db) return task();\n");

// A number is unique only inside its counter here. A write does not read the numbers, and no index is unique on them
const manyCounters = (text: string): string =>
  swap(
    text,
    '{ _id: this.collectionName },\n            { $inc: { seq: count }, $setOnInsert: { epoch: randomUUID() } },\n            { upsert: true, returnDocument: "after", session }',
    '{ _id: `${this.collectionName}:${Math.floor(Math.random() * 1000)}` },\n            { $inc: { seq: count }, $setOnInsert: { epoch: randomUUID() } },\n            { upsert: true, returnDocument: "after", session }'
  );

const text = readFileSync(source, "utf8");
const copies: Record<(typeof SEPARATE_ARMS)[number], string> = { noqueue: noQueue(text), many: manyCounters(text), neither: manyCounters(noQueue(text)) };
for (const arm of SEPARATE_ARMS) writeFileSync(new URL(`../src/storage/document-storage.${arm}.ts`, import.meta.url), copies[arm]);

await runTenantJob(SEPARATE_CASES, "store", SEPARATE_ARMS);
