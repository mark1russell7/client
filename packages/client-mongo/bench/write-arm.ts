/**
 * One arm of the write burst bench, in its own process: `--arm before|after --case <case> --job <n> --counts <file>`.
 *
 * The child makes the stores of the case on the default connection, writes one document to each store,
 * and then sends the bursts. The arm `after` is the source of this tree. The arm `before` is the whole source
 * of the base commit, which the workflow writes to `base/`. The child prints the JSON line of `freshRun`,
 * and adds one line to the file of the counts.
 */

import { appendFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { quantile } from "@mark1russell7/rigor-statistics";
import { STORES, WRITE_BYTES, burstsOf, parseWriteCase, type WriteCount } from "./write-cases.js";

const { values } = parseArgs({ options: { arm: { type: "string" }, case: { type: "string" }, job: { type: "string" }, counts: { type: "string" } } });
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

const bursts = burstsOf(stores.length * writes);
const times: number[] = [];
let failures = 0;
const write = async (store: Store, id: string): Promise<void> => {
  const began = performance.now();
  try {
    await store.set(id, { text });
    times.push(performance.now() - began);
  } catch {
    failures++;
  }
};

const began = performance.now();
for (let burst = 0; burst < bursts; burst++) {
  await Promise.all(stores.flatMap((store) => Array.from({ length: writes }, (_, index) => write(store, `d${burst}-${index}`))));
}
const burstMs = performance.now() - began;

const line: WriteCount = {
  job,
  arm,
  case: caseName,
  burstMs,
  writesPerSecond: (times.length / burstMs) * 1000,
  p95Ms: times.length === 0 ? 0 : quantile(times, 0.95),
  failures,
};
appendFileSync(counts, `${JSON.stringify(line)}\n`);
await (await ensureConnection()).getDb().dropDatabase().catch(() => undefined);
await disconnect();
console.log(JSON.stringify({ ms: burstMs }));
process.exit(0);
