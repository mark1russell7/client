/**
 * One child of `freshRun` for the tenant load bench: `--arm store|control --case <case> --job <n> --counts <file>`.
 *
 * The child starts the writers of the case in their own processes, gives them one start time and joins their
 * completions into the measure of one open-loop run. It reads the counters of the server over the load and the
 * grace, adds one line to the file of the counts, and prints the p99 as the time of `freshRun`.
 */

import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { latencyQuantile, measureLoad, scheduleHeld, type Completion } from "@mark1russell7/rigor-chaos";
import { median, quantile } from "@mark1russell7/rigor-statistics";
import { MongoClient } from "mongodb";
import { BURST_TENANT, DRIVER_LIMIT_MS, GRACE_MS, WINDOW_MS, parseTenantCase, tenantOf, type TenantCount } from "./tenant-cases.js";
import { planOf } from "./tenant-plan.js";

const { values } = parseArgs({ options: { arm: { type: "string" }, case: { type: "string" }, job: { type: "string" }, counts: { type: "string" } } });
const { arm, case: caseName, job, counts } = values;
const url = process.env["MONGO_TEST_URL"];
if ((arm !== "store" && arm !== "control") || !caseName || !job || !counts || !url) throw new RangeError("this child needs --arm, --case, --job, --counts and MONGO_TEST_URL");

const kase = parseTenantCase(caseName);
const seed = `${job}/${process.pid}`;
const database = `tenant_bench_${process.pid}`;
const plan = planOf(caseName, seed);
const writerFile = join(dirname(fileURLToPath(import.meta.url)), "tenant-writer.ts");

interface WriterResult {
  readonly completions: Completion[];
  readonly failures: number;
  readonly writeConflicts: number;
}

const writers = Array.from({ length: kase.processes }, (_, me) => {
  const child = spawn(process.execPath, ["--import", "tsx", writerFile, "--arm", arm, "--case", caseName, "--seed", seed, "--me", String(me), "--database", database], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  const out = createInterface({ input: child.stdout });
  const ready = new Promise<void>((resolve, reject) => {
    out.once("line", () => resolve());
    child.once("exit", (code) => reject(new Error(`a writer ended with the code ${code} before it was ready`)));
  });
  const result = new Promise<WriterResult>((resolve) => {
    void ready.then(() => out.once("line", (line) => resolve(JSON.parse(line) as WriterResult)));
  });
  return { child, ready, result };
});

const admin = await MongoClient.connect(url);
const serverCounts = async (): Promise<{ started: number; aborted: number }> => {
  const status = await admin.db("admin").command({ serverStatus: 1 });
  return {
    started: Number(status["transactions"]?.["totalStarted"] ?? 0),
    aborted: Number(status["transactions"]?.["totalAborted"] ?? 0),
  };
};

await Promise.all(writers.map((writer) => writer.ready));
const before = await serverCounts();
const startAt = Date.now() + 1_000;
for (const writer of writers) writer.child.stdin.write(`${startAt}\n`);

const results = await Promise.all(writers.map((writer) => writer.result));
const after = await serverCounts();

const end = WINDOW_MS + GRACE_MS;
const completions = results.flatMap((result) => result.completions);
const measure = measureLoad(plan, completions, end);
const failures = results.reduce((sum, result) => sum + result.failures, 0);
const driver = scheduleHeld(measure, DRIVER_LIMIT_MS);

const finished = completions.filter((entry) => entry.done !== null);
const inWindow = finished.filter((entry) => entry.done! <= WINDOW_MS).length;
const latencyOf = (entry: Completion): number => entry.done! - plan.times[entry.index]!;
const quarter = (from: number, to: number): number[] => {
  const own = finished.filter((entry) => plan.times[entry.index]! >= from && plan.times[entry.index]! < to).map(latencyOf);
  return own.length > 0 ? own : [0];
};
const drift = median(quarter(0.75 * WINDOW_MS, WINDOW_MS)) / Math.max(median(quarter(0, 0.25 * WINDOW_MS)), 0.001);
// The tenants other than the tenant of the burst: a reply counts from its plan, and a write with no reply counts at its age at the end.
const doneByIndex = new Map(completions.map((entry) => [entry.index, entry.done]));
const othersValues = plan.times.flatMap((planned, index) => {
  if (kase.burst && tenantOf(kase, index, planned) === BURST_TENANT) return [];
  const done = doneByIndex.get(index) ?? null;
  return [done === null ? Math.max(0, end - planned) : done - planned];
});
const othersP99 = quantile(othersValues, 0.99, "nearest-rank");

const p99Ms = latencyQuantile(measure, 0.99);
const line: TenantCount = {
  job,
  arm,
  case: caseName,
  planned: measure.planned,
  unsent: measure.unsent,
  unfinished: measure.unfinished,
  failures,
  writesPerSecond: inWindow / (WINDOW_MS / 1000),
  p50Ms: latencyQuantile(measure, 0.5),
  p95Ms: latencyQuantile(measure, 0.95),
  p99Ms,
  othersP99Ms: othersP99,
  drift,
  driverHeld: driver.held,
  driverWorstMs: driver.worst,
  writeConflicts: results.reduce((sum, result) => sum + result.writeConflicts, 0),
  transactionsStarted: after.started - before.started,
  transactionsAborted: after.aborted - before.aborted,
};
appendFileSync(counts, `${JSON.stringify(line)}\n`);
await admin.db(database).dropDatabase().catch(() => undefined);
await admin.close();
console.log(JSON.stringify({ ms: Math.max(p99Ms, 0.001) }));
process.exit(0);
