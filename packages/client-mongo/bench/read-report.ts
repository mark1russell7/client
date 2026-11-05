/**
 * The report of the change read bench: `--jobs <folder> --out <file> [--run <id>]`. This script pools
 * the jobs, and writes for each arm and case the median and the worst of each measure. It also writes
 * the interval of the ratio after/before of the time of a burst, and the A/A band of the same run.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { aaBand, caseIntervals, poolRecords, type PairedTime } from "@mark1russell7/rigor-bench";
import { median } from "@mark1russell7/rigor-statistics";
import type { ReadCount } from "./read-cases.js";

interface JobFile {
  readonly job: string;
  readonly env: unknown;
  readonly candidate: readonly PairedTime[];
  readonly aa: readonly PairedTime[];
  /** The other arms of the suite `read-bound`, by arm. */
  readonly shares?: Readonly<Record<string, readonly PairedTime[]>>;
}

const { values } = parseArgs({ options: { jobs: { type: "string" }, out: { type: "string" }, run: { type: "string" } } });
if (values.jobs === undefined || values.out === undefined) throw new RangeError("this report needs --jobs and --out");

const folder = values.jobs;
const names = readdirSync(folder);
const jobs = names.filter((name) => name.endsWith(".json")).map((name) => JSON.parse(readFileSync(join(folder, name), "utf8")) as JobFile);
const counts = names
  .filter((name) => name.endsWith(".jsonl"))
  .flatMap((name) => readFileSync(join(folder, name), "utf8").trim().split("\n"))
  .map((line) => JSON.parse(line) as ReadCount);

const round = (value: number, digits: number): number => Number(value.toFixed(digits));

const MEASURES = ["burstMs", "readsPerSecond", "commands", "writes", "probeMs", "probeP50Ms", "probeP95Ms", "otherMs", "otherP50Ms", "otherP95Ms", "loopMaxMs", "connections"] as const;

const groups = new Map<string, ReadCount[]>();
for (const row of counts) {
  const key = `${row.case}-${row.arm}`;
  groups.set(key, [...(groups.get(key) ?? []), row]);
}

const cells = [...groups.values()]
  .sort((a, b) => a[0]!.case.localeCompare(b[0]!.case) || a[0]!.arm.localeCompare(b[0]!.arm))
  .map((rows) => ({
    case: rows[0]!.case,
    arm: rows[0]!.arm,
    children: rows.length,
    measures: Object.fromEntries(
      MEASURES.map((measure) => {
        const list = rows.map((row) => row[measure]);
        return [measure, { median: round(median(list), 1), low: round(Math.min(...list), 1), high: round(Math.max(...list), 1) }];
      })
    ),
  }));

const pool = poolRecords(jobs.map(({ job, candidate, aa }) => ({ job, candidate, aa })));
const band = aaBand(pool.aa);

const report = {
  schema: "read-bench/1",
  run: values.run ?? "",
  aa: { noise: round(band.noise, 4), high: round(band.high, 3), median: round(band.median, 3), cases: band.cases },
  burst: caseIntervals(pool.candidate).map((entry) => ({
    case: entry.case,
    ratio: round(entry.ratio, 4),
    low: round(entry.low, 4),
    high: round(entry.high, 4),
    bound: round(entry.high * band.high, 4),
    rounds: entry.rounds,
  })),
  shares: Object.fromEntries(
    [...new Set(jobs.flatMap((job) => Object.keys(job.shares ?? {})))].map((share) => [
      share,
      caseIntervals(poolRecords(jobs.map(({ job, shares, aa }) => ({ job, candidate: shares?.[share] ?? [], aa }))).candidate).map((entry) => ({
        case: entry.case,
        ratio: round(entry.ratio, 4),
        low: round(entry.low, 4),
        high: round(entry.high, 4),
        rounds: entry.rounds,
      })),
    ]),
  ),
  cells,
  env: jobs.map(({ job, env }) => ({ job, env })),
};
writeFileSync(values.out, `${JSON.stringify(report, null, 2)}\n`);
