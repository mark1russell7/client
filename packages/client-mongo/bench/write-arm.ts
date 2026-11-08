/**
 * One arm of the write burst bench, in its own process: `--arm before|after --case <case> --job <n> --counts <file> [--bursts <n>]`.
 *
 * The child makes the stores of the case on the default connection, writes one document to each store,
 * and then sends the bursts. The arm `after` is the source of this tree. The arm `before` is the whole source
 * of the base commit, which the workflow writes to `base/`. The child prints the JSON line of `freshRun`,
 * and adds one line to the file of the counts.
 *
 * With `--bursts`, the child sends that number of bursts and its time is the median burst. So a short stall of the
 * machine does not move the time of the child. A slow write that comes in few bursts does not move it either: the
 * counts keep the time of each burst for this reason.
 */

import { appendFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { median, quantile } from "@mark1russell7/rigor-statistics";
import { STORES, WRITE_BYTES, burstsOf, keepError, parseWriteCase, type KeptError, type WriteCount } from "./write-cases.js";

const { values } = parseArgs({ options: { arm: { type: "string" }, case: { type: "string" }, job: { type: "string" }, counts: { type: "string" }, bursts: { type: "string" } } });
const { arm, case: caseName, job, counts } = values;
if ((arm !== "before" && arm !== "after") || caseName === undefined || job === undefined || counts === undefined) throw new RangeError("this child needs --arm, --case, --job and --counts");
const { shape, writes } = parseWriteCase(caseName);

const url = process.env["MONGO_TEST_URL"];
if (url === undefined) throw new RangeError("this child needs MONGO_TEST_URL");

const root = arm === "before" ? "../base/src" : "../src";
const { MongoDocumentStorage } = (await import(`${root}/storage/document-storage.ts`)) as typeof import("../src/storage/document-storage.js");
const { configure, disconnect, ensureConnection } = (await import(`${root}/connection.ts`)) as typeof import("../src/connection.js");

const name = `write_bench_${process.pid}`;
configure({ uri: url, database: name });

type Store = InstanceType<typeof MongoDocumentStorage<{ text: string }>>;
const make = (index: number): Store => {
  if (shape === "many") return new MongoDocumentStorage<{ text: string }>({ collection: `docs${index}` });
  if (shape === "part") return new MongoDocumentStorage<{ text: string }>({ collection: "docs", partition: `t${index}` });
  return new MongoDocumentStorage<{ text: string }>({ collection: "docs" });
};
const stores = Array.from({ length: shape === "one" ? 1 : STORES }, (_, index) => make(index));
const text = "x".repeat(WRITE_BYTES);

// The first write of a store makes its indexes and its counter. The bench measures the writes after it.
for (const store of stores) await store.set("first", { text });

const bursts = values.bursts === undefined ? burstsOf(stores.length * writes) : Number(values.bursts);
if (!Number.isInteger(bursts) || bursts < 1) throw new RangeError("--bursts needs a whole number above 0");
const times: number[] = [];
let failures = 0;
const errors: Record<string, KeptError> = {};
const write = async (store: Store, id: string): Promise<void> => {
  const began = performance.now();
  try {
    await store.set(id, { text });
    times.push(performance.now() - began);
  } catch (error) {
    failures++;
    keepError(errors, error);
  }
};

const burstTimesMs: number[] = [];
const began = performance.now();
for (let burst = 0; burst < bursts; burst++) {
  const burstBegan = performance.now();
  await Promise.all(stores.flatMap((store) => Array.from({ length: writes }, (_, index) => write(store, `d${burst}-${index}`))));
  burstTimesMs.push(performance.now() - burstBegan);
}
const burstMs = performance.now() - began;
const medianBurstMs = median(burstTimesMs);

const line: WriteCount = {
  job,
  arm,
  case: caseName,
  burstMs,
  medianBurstMs,
  burstTimesMs: burstTimesMs.map((time) => Number(time.toFixed(1))),
  writesPerSecond: (times.length / burstMs) * 1000,
  p95Ms: times.length === 0 ? 0 : quantile(times, 0.95),
  failures,
  errors,
};
appendFileSync(counts, `${JSON.stringify(line)}\n`);
await (await ensureConnection()).getDb().dropDatabase().catch(() => undefined);
await disconnect();
console.log(JSON.stringify({ ms: values.bursts === undefined ? burstMs : medianBurstMs }));
process.exit(0);
