/**
 * The report of the write burst bench: `--jobs <folder> --out <file> [--run <id>]`. This script pools the
 * jobs. For each case it writes the ratio after/before of the time of the bursts and of the 95th percentile,
 * each with its A/A beside it, and the throughput of each arm.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { aaBand, caseIntervals, poolRecords, type PairedTime } from "@mark1russell7/rigor-bench";
import { median } from "@mark1russell7/rigor-statistics";
import { poolErrors, type WriteCount } from "./write-cases.js";

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
  .map((line) => JSON.parse(line) as WriteCount);

const round = (value: number, digits: number): number => Number(value.toFixed(digits));
const middle = (rows: readonly WriteCount[], pick: (row: WriteCount) => number): number => median(rows.map(pick));

/** This function gives the median ratio of neighbor children of the arm `before`, in each job: the A/A of the 95th percentile. */
function aaOfP95(rows: readonly WriteCount[]): number {
  const ratios: number[] = [];
  for (const job of new Set(rows.map((row) => row.job))) {
    const own = rows.filter((row) => row.job === job);
    for (let at = 0; at + 1 < own.length; at += 2) ratios.push(own[at + 1]!.p95Ms / own[at]!.p95Ms);
  }
  return median(ratios);
}

const pool = poolRecords(jobs.map(({ job, candidate, aa }) => ({ job, candidate, aa })));
const band = aaBand(pool.aa);
const aaTime = new Map(caseIntervals(pool.aa).map((entry) => [entry.case, entry]));

const cases = caseIntervals(pool.candidate).map((entry) => {
  const before = counts.filter((row) => row.case === entry.case && row.arm === "before");
  const after = counts.filter((row) => row.case === entry.case && row.arm === "after");
  const aa = aaTime.get(entry.case);
  return {
    case: entry.case,
    time: { ratio: round(entry.ratio, 4), low: round(entry.low, 4), high: round(entry.high, 4), bound: round(entry.high * band.high, 4), rounds: entry.rounds },
    timeAa: aa ? { ratio: round(aa.ratio, 4), low: round(aa.low, 4), high: round(aa.high, 4) } : undefined,
    p95: { before: round(middle(before, (row) => row.p95Ms), 1), after: round(middle(after, (row) => row.p95Ms), 1), ratio: round(middle(after, (row) => row.p95Ms) / middle(before, (row) => row.p95Ms), 4), aa: round(aaOfP95(before), 4) },
    writesPerSecond: { before: round(middle(before, (row) => row.writesPerSecond), 1), after: round(middle(after, (row) => row.writesPerSecond), 1) },
    failures: { before: before.reduce((sum, row) => sum + row.failures, 0), after: after.reduce((sum, row) => sum + row.failures, 0) },
    errors: { before: poolErrors(before), after: poolErrors(after) },
    children: { before: before.length, after: after.length },
  };
});

const report = {
  schema: "write-bench/1",
  run: values.run ?? "",
  aa: { noise: round(band.noise, 4), high: round(band.high, 3), median: round(band.median, 3), cases: band.cases },
  cases,
  env: jobs.map(({ job, env }) => ({ job, env })),
};
writeFileSync(values.out, `${JSON.stringify(report, null, 2)}\n`);
