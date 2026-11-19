/**
 * One child of the slow partition bench, in its own process:
 * `--arm before|after --case slow-<n> --job <n> --counts <file> --cap <seconds>`.
 *
 * The child makes one view for each partition on one source of a real MongoDB. In the first `n`
 * partitions, the guard of this bench makes each pass slow. After the start, the child sends a change to each slow partition, and
 * a change to another normal partition each `PROBE_EVERY_MS`. It measures the time from each normal
 * change to the new row of its view. The child prints the JSON line of `freshRun` with the 95th
 * percentile of these times, and adds one line to the file of the counts.
 *
 * The arm `after` is the source of this tree. The arm `before` is the same file at the base commit,
 * which the workflow writes next to it.
 */

import { appendFileSync } from "node:fs";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";
import { MongoClient } from "mongodb";
import { quantile } from "@mark1russell7/rigor-statistics";
import { scopePipeline } from "../src/storage/pipeline-scope.js";
import { PARTITIONS, PROBES, PROBE_EVERY_MS, parseSlowCase, slowStages, type SlowCount } from "./slow-cases.js";
import { DOCS, viewPipeline } from "./stream-cases.js";

/** The time between two reads of a row. */
const POLL_MS = 20;

const { values } = parseArgs({ options: { arm: { type: "string" }, case: { type: "string" }, job: { type: "string" }, counts: { type: "string" }, cap: { type: "string" } } });
const { arm, case: caseName, job, counts } = values;
if ((arm !== "before" && arm !== "after") || caseName === undefined || job === undefined || counts === undefined) throw new RangeError("this child needs --arm before|after, --case, --job and --counts");
const capMs = Number(values.cap) * 1000;
if (!(capMs > 0)) throw new RangeError("this child needs --cap, in seconds");
const slow = parseSlowCase(caseName);

const url = process.env["MONGO_TEST_URL"];
if (url === undefined) throw new RangeError("this child needs MONGO_TEST_URL");

const source = arm === "before" ? "../src/storage/materializer.base.ts" : "../src/storage/materializer.ts";
const { ViewMaterializer } = (await import(source)) as typeof import("../src/storage/materializer.js");

const name = `slow_bench_${process.pid}`;
const observer = new MongoClient(url);
const app = new MongoClient(url);
await Promise.all([observer.connect(), app.connect()]);

const partitionOf = (index: number): string => `t${index}`;
const slowPartitions = new Set(Array.from({ length: slow }, (_, index) => partitionOf(index)));
const seed = observer.db(name);
await seed.collection("_aggregations").insertMany(
  Array.from({ length: PARTITIONS }, (_, index) => ({
    _id: `v${index}` as never,
    _part: partitionOf(index),
    collections: ["items"],
    pipeline: viewPipeline("equal", index),
    targetCollection: "sums",
  }))
);
const items = seed.collection("items");
await items.insertMany(Array.from({ length: PARTITIONS }, (_, index) => Array.from({ length: DOCS }, (_, n) => ({ _part: partitionOf(index), kind: "a", n: n + 1 }))).flat());

const logged: Record<string, number> = {};
const log = (level: string, message: string): void => {
  if (level === "warn" || level === "error") logged[`${level}: ${message}`] = (logged[`${level}: ${message}`] ?? 0) + 1;
};
const views = new ViewMaterializer({
  db: () => app.db(name),
  log,
  // The first stage of a scoped pipeline is the filter of its partition. The sleep comes after this filter
  scope: (pipeline, partition, view, match) => {
    const [filter, ...rest] = scopePipeline(pipeline, { match, collections: view.collections });
    return slowPartitions.has(partition) ? [filter!, ...slowStages(), ...rest] : [filter!, ...rest];
  },
});

const began = performance.now();
const ready = await Promise.race([views.start().then(() => true), sleep(capMs).then(() => false)]);
const readyMs = performance.now() - began;

/** The time of one change in a normal partition until the row of its view has the new total. */
async function probe(partition: string): Promise<number | undefined> {
  const added = 7;
  const total = (DOCS * (DOCS + 1)) / 2 + added;
  const sums = seed.collection("sums");
  const sent = performance.now();
  await items.insertOne({ _part: partition, kind: "a", n: added });
  while (performance.now() - sent < capMs) {
    if (await sums.findOne({ "_id.id": "a", _part: partition, total })) return performance.now() - sent;
    await sleep(POLL_MS);
  }
  return undefined;
}

const probeMs: number[] = [];
let probesLost = 0;
let slowEndMs = 0;
const delay = monitorEventLoopDelay({ resolution: 1 });
if (ready) {
  delay.enable();
  const sent = performance.now();
  if (slow > 0) await items.insertMany(Array.from({ length: slow }, (_, index) => ({ _part: partitionOf(index), kind: "a", n: 1 })));
  const times = await Promise.all(
    Array.from({ length: PROBES }, async (_, index) => {
      await sleep(index * PROBE_EVERY_MS);
      return probe(partitionOf(slow + index));
    })
  );
  for (const time of times) {
    if (time === undefined) probesLost++;
    else probeMs.push(time);
  }
  while (views.inFlight() > 0 && performance.now() - sent < capMs) await sleep(POLL_MS);
  slowEndMs = performance.now() - sent;
  delay.disable();
}

const line: SlowCount = { job, arm, case: caseName, ready, readyMs, probeMs: probeMs.map((time) => Math.round(time)), probesLost, slowEndMs, blockMs: delay.max / 1e6, logged };
appendFileSync(counts, `${JSON.stringify(line)}\n`);
await seed.dropDatabase().catch(() => undefined);
process.stdout.write(`${JSON.stringify({ ms: probeMs.length === 0 ? capMs : quantile(probeMs, 0.95) })}\n`, () => process.exit(0));
