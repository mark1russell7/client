/**
 * The report of the stream bench: `--jobs <folder> --out <file> [--run <id>]`. This script pools the
 * jobs, and writes for each arm, rung and pool the median and the worst of each measure, with the
 * count of starts that finished. It also writes the interval of the ratio after/before of the time
 * to ready at the paired rungs, and the A/A band of the same run.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { aaBand, caseIntervals, poolRecords, type PairedTime } from "@mark1russell7/rigor-bench";
import { median } from "@mark1russell7/rigor-statistics";
import type { StreamCount } from "./stream-cases.js";

interface JobFile {
  readonly job: string;
  readonly env: unknown;
  readonly candidate: readonly PairedTime[];
  readonly aa: readonly PairedTime[];
  readonly topAa: readonly PairedTime[];
}

const { values } = parseArgs({ options: { jobs: { type: "string" }, out: { type: "string" }, run: { type: "string" } } });
if (values.jobs === undefined || values.out === undefined) throw new RangeError("this report needs --jobs and --out");

const folder = values.jobs;
const names = readdirSync(folder);
const jobs = names.filter((name) => name.endsWith(".json")).map((name) => JSON.parse(readFileSync(join(folder, name), "utf8")) as JobFile);
const counts = names
  .filter((name) => name.endsWith(".jsonl"))
  .flatMap((name) => readFileSync(join(folder, name), "utf8").trim().split("\n"))
  .map((line) => JSON.parse(line) as StreamCount);

const round = (value: number, digits: number): number => Number(value.toFixed(digits));

const MEASURES = ["readyMs", "streams", "startProbeMs", "queries", "updates", "connections", "idleGetMore", "deliverMs", "burstMs", "burstProbeMs", "burstBlockMs", "clientMb", "serverMb"] as const;

/** The median and the worst of a measure. A start that did not finish has no value of the later measures. */
function spread(rows: readonly StreamCount[], measure: (typeof MEASURES)[number]): { median: number; worst: number } | undefined {
  const values = rows.map((row) => row[measure]);
  return values.length === 0 ? undefined : { median: round(median(values), 1), worst: round(Math.max(...values), 1) };
}

const groups = new Map<string, StreamCount[]>();
for (const row of counts) {
  const key = `${row.arm}-${row.partitions}-${row.pool}`;
  groups.set(key, [...(groups.get(key) ?? []), row]);
}

const cells = [...groups.values()]
  .sort((a, b) => a[0]!.partitions - b[0]!.partitions || a[0]!.arm.localeCompare(b[0]!.arm) || a[0]!.pool - b[0]!.pool)
  .map((rows) => {
    const { arm, partitions, pool } = rows[0]!;
    const finished = rows.filter((row) => row.ready);
    return {
      arm,
      partitions,
      pool,
      starts: rows.length,
      finished: finished.length,
      burstsEnded: finished.filter((row) => row.burstEnded).length,
      measures: Object.fromEntries(MEASURES.map((measure) => [measure, spread(measure === "readyMs" || measure === "streams" ? rows : finished, measure)])),
    };
  });

const pool = poolRecords(jobs.map(({ job, candidate, aa }) => ({ job, candidate, aa })));
const band = aaBand(pool.aa);
const topBand = aaBand(poolRecords(jobs.map(({ job, candidate, topAa }) => ({ job, candidate, aa: topAa }))).aa);

const report = {
  schema: "stream-bench/1",
  run: values.run ?? "",
  aa: { noise: round(band.noise, 4), high: round(band.high, 3), median: round(band.median, 3), cases: band.cases },
  topAa: { noise: round(topBand.noise, 4), high: round(topBand.high, 3), median: round(topBand.median, 3), cases: topBand.cases },
  ready: caseIntervals(pool.candidate).map((entry) => ({
    case: entry.case,
    ratio: round(entry.ratio, 4),
    low: round(entry.low, 4),
    high: round(entry.high, 4),
    bound: round(entry.high * band.high, 4),
    rounds: entry.rounds,
  })),
  cells,
  env: jobs.map(({ job, env }) => ({ job, env })),
};
writeFileSync(values.out, `${JSON.stringify(report, null, 2)}\n`);
