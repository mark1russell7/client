/**
 * One arm of the stream bench, in its own process:
 * `--arm before|after --case ready-<partitions> --job <n> --counts <file> --cap <seconds> [--pool <size>]`.
 *
 * The child makes one view for each partition on one source of a real MongoDB, starts the
 * materializer on a client of its own, and measures from a second client:
 *
 * - the time to ready, with the worst time of a query of the same pool during the start;
 * - the connections and the `getMore` commands in `IDLE_MS` with no change;
 * - the time from an insert to the row of the view;
 * - a burst: a delete in each partition. A delete has no pre-image, so it reaches each partition.
 *
 * The arm `after` is the source of this tree. The arm `before` is the same file at the base commit,
 * which the workflow writes next to it. The child prints the JSON line of `freshRun`, and adds one
 * line to the file of the counts.
 */

import { appendFileSync } from "node:fs";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";
import { MongoClient, type Collection, type Document } from "mongodb";
import { parseCase, type StreamCount } from "./stream-cases.js";

/** The idle time of the acceptance. */
const IDLE_MS = 10_000;

/** The documents of each partition: `DOCS` for the view, and one that the burst deletes. */
const DOCS = 5;

/** The time between two queries of the probe. */
const PROBE_EVERY_MS = 50;

/** The time with no work that ends a burst. It is longer than the debounce of the materializer. */
const QUIET_MS = 2_000;

/** The time between two reads of the state of a burst or a row. */
const POLL_MS = 10;

const { values } = parseArgs({
  options: { arm: { type: "string" }, case: { type: "string" }, job: { type: "string" }, counts: { type: "string" }, cap: { type: "string" }, pool: { type: "string" } },
});
const { arm, case: caseName, job, counts } = values;
if ((arm !== "before" && arm !== "after") || caseName === undefined || job === undefined || counts === undefined) throw new RangeError("this child needs --arm before|after, --case, --job and --counts");
const capMs = Number(values.cap) * 1000;
if (!(capMs > 0)) throw new RangeError("this child needs --cap, in seconds");
const pool = Number(values.pool ?? 0);
const partitions = parseCase(caseName);

const url = process.env["MONGO_TEST_URL"];
if (url === undefined) throw new RangeError("this child needs MONGO_TEST_URL");

const source = arm === "before" ? "../src/storage/materializer.base.ts" : "../src/storage/materializer.ts";
const { ViewMaterializer } = (await import(source)) as typeof import("../src/storage/materializer.js");

const name = `stream_bench_${process.pid}`;
const observer = new MongoClient(url);
const app = new MongoClient(url, pool > 0 ? { maxPoolSize: pool } : {});
await Promise.all([observer.connect(), app.connect()]);

const seed = observer.db(name);
const partitionOf = (index: number): string => `t${index}`;
await seed.collection("_aggregations").insertMany(
  Array.from({ length: partitions }, (_, index) => ({
    _id: `v${index}` as never,
    _part: partitionOf(index),
    collections: ["items"],
    pipeline: [{ $group: { _id: "$kind", total: { $sum: "$n" } } }],
    targetCollection: "sums",
  }))
);
await seed.collection("items").insertMany(
  Array.from({ length: partitions }, (_, index) => [
    ...Array.from({ length: DOCS }, (_, n) => ({ _part: partitionOf(index), kind: "a", n: n + 1 })),
    { _part: partitionOf(index), kind: "b", n: 0 },
  ]).flat()
);

/** The counters of the server that the child reads. */
async function server(): Promise<{ connections: number; getMore: number; queries: number; updates: number; residentMb: number }> {
  const status = await observer.db("admin").command({ serverStatus: 1 });
  return {
    connections: Number(status["connections"].current),
    getMore: Number(status["opcounters"].getmore),
    queries: Number(status["opcounters"].query),
    updates: Number(status["opcounters"].update),
    residentMb: Number(status["mem"].resident),
  };
}

/**
 * This function sends a query of the pool of the application again and again. The function that it
 * gives ends the probe and gives the worst time. A query that has not ended counts with its time so far.
 */
function probe(collection: Collection<Document>): () => number {
  let running = true;
  let worst = 0;
  let began = 0;
  void (async () => {
    while (running) {
      began = performance.now();
      await collection.findOne({ _part: partitionOf(0) });
      worst = Math.max(worst, performance.now() - began);
      began = 0;
      await sleep(PROBE_EVERY_MS);
    }
  })().catch(() => undefined);
  return () => {
    running = false;
    return began > 0 ? Math.max(worst, performance.now() - began) : worst;
  };
}

const views = new ViewMaterializer({ db: () => app.db(name), log: () => undefined });
const items = app.db(name).collection("items");

const before = await server();
const endStartProbe = probe(items);
const began = performance.now();
const ready = await Promise.race([views.start().then(() => true), sleep(capMs).then(() => false)]);
const readyMs = ready ? performance.now() - began : capMs;
const startProbeMs = endStartProbe();
const streams = views.openStreamCount();
const started = await server();

const counted = {
  job,
  arm,
  partitions,
  pool,
  ready,
  readyMs,
  streams,
  startProbeMs,
  queries: started.queries - before.queries,
  updates: started.updates - before.updates,
  clientMb: process.memoryUsage().rss / 1024 / 1024,
  serverMb: started.residentMb,
};

/** This function writes the line of the counts and the line of `freshRun`, and ends the child. */
async function finish(rest: Omit<StreamCount, keyof typeof counted>): Promise<never> {
  appendFileSync(counts!, `${JSON.stringify({ ...counted, ...rest } satisfies StreamCount)}\n`);
  await observer.db(name).dropDatabase().catch(() => undefined);
  console.log(JSON.stringify({ ms: readyMs }));
  process.exit(0);
}

if (!ready) await finish({ connections: started.connections - before.connections, idleGetMore: 0, deliverMs: 0, burstEnded: false, burstMs: 0, burstProbeMs: 0, burstBlockMs: 0 });

const idleStart = await server();
await sleep(IDLE_MS);
const idleEnd = await server();

/** The time of one insert until the row of the view has the new total. */
async function deliver(): Promise<number> {
  const added = 7;
  const total = (DOCS * (DOCS + 1)) / 2 + added;
  const sums = observer.db(name).collection("sums");
  const sent = performance.now();
  await observer.db(name).collection("items").insertOne({ _part: partitionOf(0), kind: "a", n: added });
  for (;;) {
    if (await sums.findOne({ "_id.id": "a", _part: partitionOf(0), total })) return performance.now() - sent;
    if (performance.now() - sent > capMs) return capMs;
    await sleep(POLL_MS);
  }
}

/** A delete in each partition, until the last pass ends. */
async function burst(): Promise<{ burstEnded: boolean; burstMs: number; burstProbeMs: number; burstBlockMs: number }> {
  const delay = monitorEventLoopDelay({ resolution: 1 });
  delay.enable();
  const endProbe = probe(items);
  const sent = performance.now();
  await observer.db(name).collection("items").deleteMany({ kind: "b" });
  let lastWork = sent;
  let now = sent;
  while (now - lastWork < QUIET_MS && now - sent < capMs) {
    await sleep(POLL_MS);
    now = performance.now();
    if (views.inFlight() > 0) lastWork = now;
  }
  delay.disable();
  return { burstEnded: now - lastWork >= QUIET_MS, burstMs: lastWork - sent, burstProbeMs: endProbe(), burstBlockMs: delay.max / 1e6 };
}

const deliverMs = await deliver();
const burstResult = await burst();
await finish({ connections: idleEnd.connections - before.connections, idleGetMore: idleEnd.getMore - idleStart.getMore, deliverMs, ...burstResult });
