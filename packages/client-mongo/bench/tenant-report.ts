/**
 * The report of the tenant load bench: `--jobs <folder> --out <file> [--run <id>]`. For each case and arm this script
 * gives the median and the worst of each measure over the children, and a reading against the first guess of the
 * ladder. A rate that is a first guess gives only a provisional pass. A driver that lost its schedule gives no reading.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { aaBand, caseIntervals, poolRecords, type PairedTime } from "@mark1russell7/rigor-bench";
import { median } from "@mark1russell7/rigor-statistics";
import { KEEP_UP_P99_MS, KEEP_UP_SHARE, parseTenantCase, type TenantCount } from "./tenant-cases.js";

interface JobFile {
  readonly job: string;
  readonly env: unknown;
  readonly candidate: readonly PairedTime[];
  readonly aa: readonly PairedTime[];
}

const { values } = parseArgs({ options: { jobs: { type: "string" }, out: { type: "string" }, run: { type: "string" } } });
if (values.jobs === undefined || values.out === undefined) throw new RangeError("this report needs --jobs and --out");

const folder = values.jobs;
const names = readdirSync(folder);
const jobs = names.filter((name) => name.endsWith(".json")).map((name) => JSON.parse(readFileSync(join(folder, name), "utf8")) as JobFile);
const counts = names
  .filter((name) => name.endsWith(".jsonl"))
  .flatMap((name) => readFileSync(join(folder, name), "utf8").trim().split("\n"))
  .map((line) => JSON.parse(line) as TenantCount);

const round = (value: number, digits = 1): number => Number(value.toFixed(digits));
const summary = (rows: readonly TenantCount[], pick: (row: TenantCount) => number): { median: number; worst: number } => ({
  median: round(median(rows.map(pick))),
  worst: round(Math.max(...rows.map(pick))),
});

/** This function gives the reading of the children of one arm of one case. */
function readingOf(rows: readonly TenantCount[], rate: number): { outcome: string; reasons: string[] } {
  if (rows.some((row) => !row.driverHeld)) return { outcome: "no reading", reasons: ["a driver did not keep its schedule"] };
  const reasons: string[] = [];
  if (rows.some((row) => row.failures > 0)) reasons.push("a write failed");
  if (rows.some((row) => row.unfinished + row.unsent > 0)) reasons.push("a write had no reply in the grace");
  if (rows.some((row) => row.writesPerSecond < KEEP_UP_SHARE * rate)) reasons.push(`a child ended under ${KEEP_UP_SHARE} of the rate in the load`);
  if (rows.some((row) => row.p99Ms > KEEP_UP_P99_MS)) reasons.push(`a child had a p99 over ${KEEP_UP_P99_MS} ms`);
  return { outcome: reasons.length === 0 ? "provisional pass" : "fail", reasons };
}

const pool = poolRecords(jobs.map(({ job, candidate, aa }) => ({ job, candidate, aa })));
const band = aaBand(pool.aa);
const ratios = new Map(caseIntervals(pool.candidate).map((entry) => [entry.case, entry]));
const aaRatios = new Map(caseIntervals(pool.aa).map((entry) => [entry.case, entry]));

const caseNames = [...new Set(counts.map((row) => row.case))];
const cases = caseNames.map((name) => {
  const { rate, processes, burst, active } = parseTenantCase(name);
  const arms = (["store", "control"] as const).map((arm) => {
    const rows = counts.filter((row) => row.case === name && row.arm === arm);
    return {
      arm,
      children: rows.length,
      reading: readingOf(rows, rate),
      writesPerSecond: summary(rows, (row) => row.writesPerSecond),
      p50Ms: summary(rows, (row) => row.p50Ms),
      p95Ms: summary(rows, (row) => row.p95Ms),
      p99Ms: summary(rows, (row) => row.p99Ms),
      othersP99Ms: summary(rows, (row) => row.othersP99Ms),
      drift: summary(rows, (row) => row.drift),
      driverWorstMs: Math.max(...rows.map((row) => row.driverWorstMs ?? 0)),
      failures: rows.reduce((sum, row) => sum + row.failures, 0),
      unfinished: rows.reduce((sum, row) => sum + row.unfinished, 0),
      unsent: rows.reduce((sum, row) => sum + row.unsent, 0),
      writeConflicts: summary(rows, (row) => row.writeConflicts),
      transactionsStarted: summary(rows, (row) => row.transactionsStarted),
      transactionsAborted: summary(rows, (row) => row.transactionsAborted),
    };
  });
  const ratio = ratios.get(name);
  const aa = aaRatios.get(name);
  return {
    case: name,
    rate,
    processes,
    burst,
    activeTenants: active,
    tenantsOfRung: active * 10,
    arms,
    p99StoreOverControl: ratio ? { ratio: round(ratio.ratio, 3), low: round(ratio.low, 3), high: round(ratio.high, 3) } : undefined,
    p99Aa: aa ? { ratio: round(aa.ratio, 3), low: round(aa.low, 3), high: round(aa.high, 3) } : undefined,
  };
});

const report = {
  schema: "tenant-bench/1",
  run: values.run ?? "",
  rule: `A provisional pass has no failure, a reply to each write, at least ${KEEP_UP_SHARE} of the rate and a p99 of at most ${KEEP_UP_P99_MS} ms. The rate is a first guess, and this limit is a first reading. One arrival is one write of one document, so an action of an app with more writes takes the rate of its writes.`,
  aa: { noise: round(band.noise, 4), high: round(band.high, 3), median: round(band.median, 3), cases: band.cases },
  cases,
  env: jobs.map(({ job, env }) => ({ job, env })),
};
writeFileSync(values.out, `${JSON.stringify(report, null, 2)}\n`);
