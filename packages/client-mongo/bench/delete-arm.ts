/**
 * One child of the delete bench, in its own process: `--arm after --case <case> --job <n> --counts <file> --cap <seconds>`.
 *
 * The child makes one view for each partition on one source of a real MongoDB and starts the
 * materializer. After the first passes, it sends the deletes of the case and measures the time until
 * the last pass ends, and the commands of those passes. It prints the JSON line of `freshRun`, and
 * adds one line to the file of the counts.
 */

import { appendFileSync } from "node:fs";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";
import { MongoClient, type Document } from "mongodb";
import { identityPartition, ViewMaterializer } from "../src/storage/materializer.js";
import { HOT_DELETES, parseDeleteCase, type DeleteCount } from "./delete-cases.js";
import { DOCS, viewPipeline } from "./stream-cases.js";

/** The time with no command that ends the passes. It is longer than the debounce of the materializer. */
const QUIET_MS = 2_000;

/** The time between two reads of the state of the passes. */
const POLL_MS = 10;

/** The commands of the driver, which are not work of a pass. */
const NOT_WORK = new Set(["getMore", "hello", "isMaster", "ping", "endSessions"]);

const { values } = parseArgs({ options: { arm: { type: "string" }, case: { type: "string" }, job: { type: "string" }, counts: { type: "string" }, cap: { type: "string" } } });
const { case: caseName, job, counts } = values;
if (caseName === undefined || job === undefined || counts === undefined) throw new RangeError("this child needs --case, --job and --counts");
const capMs = Number(values.cap) * 1000;
if (!(capMs > 0)) throw new RangeError("this child needs --cap, in seconds");
const { kind, partitions, route } = parseDeleteCase(caseName);

const url = process.env["MONGO_TEST_URL"];
if (url === undefined) throw new RangeError("this child needs MONGO_TEST_URL");

const name = `delete_bench_${process.pid}`;
const observer = new MongoClient(url);
const app = new MongoClient(url, { monitorCommands: true });
await Promise.all([observer.connect(), app.connect()]);

const partitionOf = (index: number): string => `t${index}`;
const seed = observer.db(name);
if (route === "image") await seed.createCollection("items", { changeStreamPreAndPostImages: { enabled: true } });
await seed.collection("_aggregations").insertMany(
  Array.from({ length: partitions }, (_, index) => ({
    _id: `v${index}` as never,
    _part: partitionOf(index),
    collections: ["items"],
    pipeline: viewPipeline("equal", index),
    targetCollection: "sums",
  }))
);
await seed.collection("items").insertMany([
  ...Array.from({ length: partitions }, (_, index): Document[] => [
    ...Array.from({ length: DOCS }, (_, n) => ({ _id: `${partitionOf(index)}|a${n}`, _part: partitionOf(index), kind: "a", n: n + 1 })),
    { _id: `${partitionOf(index)}|b0`, _part: partitionOf(index), kind: "b", n: 0, first: true },
  ]).flat(),
  ...Array.from({ length: HOT_DELETES - 1 }, (_, n) => ({ _id: `${partitionOf(0)}|b${n + 1}`, _part: partitionOf(0), kind: "b", n: 0 })),
] as never[]);

let lastWork = 0;
let sourceReads = 0;
let commands = 0;
app.on("commandStarted", (event) => {
  if (NOT_WORK.has(event.commandName)) return;
  lastWork = performance.now();
  commands++;
  if (event.commandName === "aggregate" && (event.command as Document)["aggregate"] === "items") sourceReads++;
});
app.on("commandSucceeded", (event) => {
  if (!NOT_WORK.has(event.commandName)) lastWork = performance.now();
});

/** The partition of a document of this bench is in its `_id`, so a delete tells it without a pre-image. */
const rule = { items: { form: { partitionOf: (doc: Document) => (typeof doc["_id"] === "string" ? doc["_id"].split("|")[0] : undefined) }, viewPartitionOf: identityPartition } };
const logged: Record<string, number> = {};
const log = (level: string, message: string): void => {
  if (level === "warn" || level === "error") logged[`${level}: ${message}`] = (logged[`${level}: ${message}`] ?? 0) + 1;
};
const views = new ViewMaterializer({ db: () => app.db(name), log, ...(route === "rule" ? { storageSources: rule } : {}) });

/** This function waits until the materializer sends no command for `QUIET_MS`, up to the cap. It tells if that happened. */
async function quiet(from: number): Promise<boolean> {
  for (;;) {
    const now = performance.now();
    if (views.inFlight() === 0 && now - Math.max(from, lastWork) >= QUIET_MS) return true;
    if (now - from > capMs) return false;
    await sleep(POLL_MS);
  }
}

await views.start();
const settled = await quiet(performance.now());
if (!settled) throw new Error(`the first passes of ${caseName} did not end in ${String(capMs)} ms`);

const items = observer.db(name).collection("items");
const delay = monitorEventLoopDelay({ resolution: 1 });
sourceReads = 0;
commands = 0;
lastWork = 0;
delay.enable();
const sent = performance.now();
if (kind === "one") await items.deleteOne({ _id: `${partitionOf(0)}|b0` as never });
else if (kind === "hot") await items.deleteMany({ _part: partitionOf(0), kind: "b" });
else await items.deleteMany({ first: true });
const deleteMs = performance.now() - sent;
const ended = await quiet(sent);
delay.disable();

const passesMs = lastWork === 0 ? 0 : lastWork - sent;
const line: DeleteCount = { job, case: caseName, ended: ended && lastWork > 0, passesMs, deleteMs, sourceReads, commands, blockMs: delay.max / 1e6, logged };
appendFileSync(counts, `${JSON.stringify(line)}\n`);
await observer.db(name).dropDatabase().catch(() => undefined);
process.stdout.write(`${JSON.stringify({ ms: passesMs })}\n`, () => process.exit(0));
