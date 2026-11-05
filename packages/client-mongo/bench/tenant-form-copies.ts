/**
 * The copies of the store for the forms of the numbers (roadmap CLI-96). Each copy comes from the source of this tree, so
 * the arms follow the code. A text that this file does not find stops the job. The copies are only for the benches.
 *
 * - `today`: the store, with a hold in the write.
 * - `forma`: a counter for each partition, and a queue for each partition.
 * - `formaguard`: `forma`, and a change read gives a full result when the counter of the collection is above the frozen number 0. So an old writer shows up.
 * - `formb`: a counter outside the transaction, with a watermark for readers, and no queue. A write of one document needs no transaction here.
 * - `formbbound`: form B with a bound on the calls in progress in each process, in place of the queue.
 * - `outside`: a counter outside the transaction with no watermark. This form loses writes, so it proves that the test of the rule finds a miss.
 */

import { readFileSync, writeFileSync } from "node:fs";

/** The copies of the store. */
export const FORM_COPIES = ["today", "forma", "formaguard", "formb", "formbbound", "formbbound8", "formbbound32", "outside"] as const;

/** One copy of the store. */
export type FormCopy = (typeof FORM_COPIES)[number];

/** This function changes one text of the source, and stops when the source does not have this text one time. */
export function swap(text: string, from: string, to: string): string {
  return swapAll(text, from, to, 1);
}

/** This function changes each copy of a text of the source, and stops when the source does not have this text `count` times. */
function swapAll(text: string, from: string, to: string, count: number): string {
  if (text.split(from).length !== count + 1) throw new RangeError(`the source does not have this text ${count} times: ${from}`);
  return text.split(from).join(to);
}

const ENQUEUE = "function enqueue<R>(db: Db, name: string, task: () => Promise<R>): Promise<R> {\n";
const NUMBERS_IN_TRANSACTION = "return write(counter.seq - count + 1, session);";
const PENDING_WRITE = "result = await write(first);";

/** This function adds a hold of a random time in the write, up to `FORM_HOLD_MS`. So other writers and readers pass a write in progress. */
function withHold(text: string): string {
  const hold = 'const formHold = async (): Promise<void> => {\n  const most = Number(process.env["FORM_HOLD_MS"] ?? 0);\n  if (most > 0) await new Promise((resolve) => setTimeout(resolve, Math.random() * most));\n};\n\n';
  const held = swap(text, ENQUEUE, `${hold}${ENQUEUE}`);
  return swap(swap(held, NUMBERS_IN_TRANSACTION, `await formHold();\n          ${NUMBERS_IN_TRANSACTION}`), PENDING_WRITE, `await formHold();\n      ${PENDING_WRITE}`);
}

const forma = (text: string): string => {
  const named = swapAll(swapAll(text, "{ _id: this.collectionName }", "{ _id: this.formCounter() }", 5), "enqueue(db, this.collectionName,", "enqueue(db, this.formCounter(),", 2);
  return swap(named, "  private async watermark(db: Db): Promise<Counter> {\n", '  private formCounter(): string {\n    return `seq\\u001f${this.collectionName}\\u001f${this.partition ?? ""}`;\n  }\n\n  private async watermark(db: Db): Promise<Counter> {\n');
};

const formaguard = (text: string): string =>
  swap(
    forma(text),
    "      const match = since === undefined ? null : /^([^.]+)\\.(\\d+)$/.exec(since);\n",
    "      const oldWriter = await db.collection<CounterDoc>(this.countersName).findOne({ _id: this.collectionName });\n      if ((oldWriter?.seq ?? 0) > 0) return full();\n      const match = since === undefined ? null : /^([^.]+)\\.(\\d+)$/.exec(since);\n",
  );

const formb = (text: string): string => swap(swap(text, ENQUEUE, `${ENQUEUE}  if (db) return task();\n`), "if (client) {\n      const session = client.startSession();", "if (client && !db) {\n      const session = client.startSession();");

/** The text of the bound of `formbbound`. One process has at most this count of calls in progress. The next call in arrival order takes the place of a call that ends. */
const formGate = (bound: number): string => `const FORM_BOUND = ${String(bound)};
let formIn = 0;
const formWaiting: Array<() => void> = [];
async function formGated<R>(task: () => Promise<R>): Promise<R> {
  if (formIn >= FORM_BOUND) await new Promise<void>((resolve) => formWaiting.push(resolve));
  else formIn++;
  try {
    return await task();
  } finally {
    const next = formWaiting.shift();
    if (next) next();
    else formIn--;
  }
}
`;

const boundOf = (bound: number) => (text: string): string =>
  swap(swap(text, ENQUEUE, `${formGate(bound)}${ENQUEUE}  if (db) return formGated(task);\n`), "if (client) {\n      const session = client.startSession();", "if (client && !db) {\n      const session = client.startSession();");

const outside = (text: string): string => swap(text, '{ upsert: true, returnDocument: "after", session }', '{ upsert: true, returnDocument: "after" }');

const CHANGES: Record<FormCopy, (text: string) => string> = { today: (text) => text, forma, formaguard, formb, formbbound: boundOf(16), formbbound8: boundOf(8), formbbound32: boundOf(32), outside };

/** This function writes each copy of the store next to the source. */
export function writeFormCopies(): void {
  const source = new URL("../src/storage/document-storage.ts", import.meta.url);
  const text = withHold(readFileSync(source, "utf8"));
  for (const copy of FORM_COPIES) writeFileSync(new URL(`../src/storage/document-storage.${copy}.ts`, import.meta.url), CHANGES[copy](text));
}
