/**
 * One child of `freshRun` for the tenant load bench: `--arm store|control --case <case> --job <n> --counts <file>`.
 *
 * The child starts the writers of the case in their own processes, gives them one start time and joins their
 * completions into the measure of one open-loop run. It reads the counters of the server over the load and the
 * grace, adds one line to the file of the counts, and prints the p99 as the time of `freshRun`.
 *
 * With `MONGO_CONTAINER`, the child puts that container on its processors for the case. A case with `-apart` needs it.
 * MongoDB keeps the sizes of its thread pools from its start, because the change comes after that start.
 */

import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { latencyQuantile, measureLoad, scheduleHeld, type Completion } from "@mark1russell7/rigor-chaos";
import { median, quantile } from "@mark1russell7/rigor-statistics";
import { MongoClient } from "mongodb";
import { ALL_CORES, BURST_TENANT, DRIVER_LIMIT_MS, GRACE_MS, MONGO_CORES, WINDOW_MS, WRITER_CORES, parseTenantCase, tenantOf, type CoreShare, type TenantCount } from "./tenant-cases.js";
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

const container = process.env["MONGO_CONTAINER"];
if (kase.apart && !container) throw new RangeError("a case with -apart needs MONGO_CONTAINER");
if (container) execFileSync("docker", ["update", "--cpuset-cpus", kase.apart ? MONGO_CORES : ALL_CORES, container], { stdio: "ignore" });

const writerCommand = [process.execPath, "--import", "tsx", writerFile, "--arm", arm, "--case", caseName, "--seed", seed];
const writers = Array.from({ length: kase.processes }, (_, me) => {
  const command = [...(kase.apart ? ["taskset", "-c", WRITER_CORES] : []), ...writerCommand, "--me", String(me), "--database", database];
  const child = spawn(command[0]!, command.slice(1), {
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

type CoreTimes = Map<number, { idle: number; iowait: number; total: number }>;

/** This function reads the times of each processor. The value is null where the machine has no `/proc/stat`. */
function readCores(): CoreTimes | null {
  let text: string;
  try {
    text = readFileSync("/proc/stat", "utf8");
  } catch {
    return null;
  }
  const times: CoreTimes = new Map();
  for (const line of text.split("\n")) {
    const match = /^cpu(\d+)\s+(.*)$/.exec(line);
    if (!match) continue;
    const fields = match[2]!.trim().split(/\s+/).map(Number);
    times.set(Number(match[1]), { idle: fields[3]!, iowait: fields[4]!, total: fields.slice(0, 8).reduce((sum, value) => sum + value, 0) });
  }
  return times;
}

/** This function gives the share of each processor between two reads. */
function coreShares(from: CoreTimes | null, to: CoreTimes | null): CoreShare[] | null {
  if (!from || !to) return null;
  return [...to].map(([core, end]) => {
    const start = from.get(core)!;
    const total = Math.max(end.total - start.total, 1);
    const idle = end.idle - start.idle;
    const iowait = end.iowait - start.iowait;
    return { core, busy: Number(((total - idle - iowait) / total).toFixed(3)), iowait: Number((iowait / total).toFixed(3)) };
  });
}

await Promise.all(writers.map((writer) => writer.ready));
const before = await serverCounts();
const startAt = Date.now() + 1_000;
for (const writer of writers) writer.child.stdin.write(`${startAt}\n`);

const inLoad = (async (): Promise<CoreShare[] | null> => {
  await sleep(Math.max(startAt - Date.now(), 0));
  const from = readCores();
  await sleep(WINDOW_MS);
  return coreShares(from, readCores());
})();

const results = await Promise.all(writers.map((writer) => writer.result));
const cores = await inLoad;
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
  cores,
};
appendFileSync(counts, `${JSON.stringify(line)}\n`);
await admin.db(database).dropDatabase().catch(() => undefined);
await admin.close();
console.log(JSON.stringify({ ms: Math.max(p99Ms, 0.001) }));
process.exit(0);
