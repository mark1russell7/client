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
import { parseTenantCase, type TenantCount } from "./tenant-cases.js";
import { READING_RULE, READING_RULE_CHANGE, readingOf } from "./tenant-reading.js";

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

/** This function gives the share of the transactions that met a write conflict, as the median over the children. */
const conflictShare = (rows: readonly TenantCount[]): number => round(median(rows.map((row) => row.writeConflicts / Math.max(row.transactionsStarted, 1))), 3);

/** This function gives the median share of each processor. A record from before this field has no processors. */
function coresOf(rows: readonly TenantCount[]): { core: number; busy: number; iowait: number }[] {
  const shares = rows.flatMap((row) => row.cores ?? []);
  return [...new Set(shares.map((share) => share.core))].sort((a, b) => a - b).map((core) => {
    const own = shares.filter((share) => share.core === core);
    return { core, busy: round(median(own.map((share) => share.busy)), 3), iowait: round(median(own.map((share) => share.iowait)), 3) };
  });
}

const pool = poolRecords(jobs.map(({ job, candidate, aa }) => ({ job, candidate, aa })));
const band = aaBand(pool.aa);
const ratios = new Map(caseIntervals(pool.candidate).map((entry) => [entry.case, entry]));
const aaRatios = new Map(caseIntervals(pool.aa).map((entry) => [entry.case, entry]));

const caseNames = [...new Set(counts.map((row) => row.case))];
const cases = caseNames.map((name) => {
  const { rate, processes, burst, apart, active } = parseTenantCase(name);
  const arms = (["store", "control"] as const).map((arm) => {
    const rows = counts.filter((row) => row.case === name && row.arm === arm);
    return {
      arm,
      children: rows.length,
      reading: readingOf(rows),
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
      conflictShare: conflictShare(rows),
      cores: coresOf(rows),
    };
  });
  const ratio = ratios.get(name);
  const aa = aaRatios.get(name);
  return {
    case: name,
    rate,
    processes,
    burst,
    apart,
    activeTenants: active,
    tenantsOfRung: active * 10,
    arms,
    p99StoreOverControl: ratio ? { ratio: round(ratio.ratio, 3), low: round(ratio.low, 3), high: round(ratio.high, 3) } : undefined,
    p99Aa: aa ? { ratio: round(aa.ratio, 3), low: round(aa.low, 3), high: round(aa.high, 3) } : undefined,
  };
});

// The cost of the conflicts is in the tail, so each row sets the p99 beside the conflict share of its process count
const tail = cases
  .filter((entry) => !entry.burst)
  .flatMap((entry) => entry.arms.map((arm) => ({ rate: entry.rate, processes: entry.processes, apart: entry.apart, arm: arm.arm, conflictShare: arm.conflictShare, p50Ms: arm.p50Ms.median, p99Ms: arm.p99Ms.median, reading: arm.reading.outcome })))
  .sort((a, b) => a.arm.localeCompare(b.arm) || Number(a.apart) - Number(b.apart) || a.rate - b.rate || a.processes - b.processes);

const report = {
  schema: "tenant-bench/1",
  run: values.run ?? "",
  rule: READING_RULE,
  ruleChange: READING_RULE_CHANGE,
  aa: { noise: round(band.noise, 4), high: round(band.high, 3), median: round(band.median, 3), cases: band.cases },
  tail,
  cases,
  env: jobs.map(({ job, env }) => ({ job, env })),
};
writeFileSync(values.out, `${JSON.stringify(report, null, 2)}\n`);
