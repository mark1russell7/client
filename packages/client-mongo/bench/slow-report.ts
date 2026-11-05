/**
 * The report of the slow partition bench: `--jobs <folder> --out <file> [--run <id>]`. For each case and
 * arm, this script gives the time from a change in a normal partition to its row: the median, the 95th
 * percentile and the worst of all changes, with the ratio after/before and its A/A beside it.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { caseIntervals, poolRecords, type PairedTime } from "@mark1russell7/rigor-bench";
import { median, quantile } from "@mark1russell7/rigor-statistics";
import { SLOW_CASES, type SlowCount } from "./slow-cases.js";

interface JobFile {
  readonly job: string;
  readonly candidate: readonly PairedTime[];
  readonly aa: readonly PairedTime[];
}

const { values } = parseArgs({ options: { jobs: { type: "string" }, out: { type: "string" }, run: { type: "string" } } });
if (values.jobs === undefined || values.out === undefined) throw new RangeError("this report needs --jobs and --out");

const folder = values.jobs;
const names = readdirSync(folder);
const jobs = names.filter((name) => name.endsWith(".json")).map((name) => JSON.parse(readFileSync(join(folder, name), "utf8")) as JobFile);
const rows = names
  .filter((name) => name.endsWith(".jsonl"))
  .flatMap((name) => readFileSync(join(folder, name), "utf8").trim().split("\n"))
  .map((line) => JSON.parse(line) as SlowCount);

const round = (value: number): number => Number(value.toFixed(1));
const ratio = (entry: { ratio: number; low: number; high: number } | undefined): object | null =>
  entry ? { ratio: Number(entry.ratio.toFixed(4)), low: Number(entry.low.toFixed(4)), high: Number(entry.high.toFixed(4)) } : null;

/** This function gives the figures of one arm of one case. */
function figures(starts: readonly SlowCount[]): object {
  const probes = starts.flatMap((row) => row.probeMs);
  const logged: Record<string, number> = {};
  for (const row of starts) for (const [line, count] of Object.entries(row.logged)) logged[line] = (logged[line] ?? 0) + count;
  return {
    starts: starts.length,
    ready: starts.filter((row) => row.ready).length,
    readyMs: starts.length === 0 ? null : round(median(starts.map((row) => row.readyMs))),
    probes: probes.length,
    probesLost: starts.reduce((sum, row) => sum + row.probesLost, 0),
    probeMs: probes.length === 0 ? null : { median: round(median(probes)), p95: round(quantile(probes, 0.95)), worst: round(Math.max(...probes)) },
    slowEndMs: starts.length === 0 ? null : round(median(starts.map((row) => row.slowEndMs))),
    blockMs: starts.length === 0 ? null : { median: round(median(starts.map((row) => row.blockMs))), worst: round(Math.max(...starts.map((row) => row.blockMs))) },
    logged,
  };
}

const pool = poolRecords(jobs.map(({ job, candidate, aa }) => ({ job, candidate, aa })));
const time = new Map(caseIntervals(pool.candidate).map((entry) => [entry.case, entry]));
const aa = new Map(caseIntervals(pool.aa).map((entry) => [entry.case, entry]));

const cases = SLOW_CASES.map((id) => {
  const own = rows.filter((row) => row.case === id);
  return {
    case: id,
    p95Ratio: ratio(time.get(id)),
    p95RatioAa: ratio(aa.get(id)),
    before: figures(own.filter((row) => row.arm === "before")),
    after: figures(own.filter((row) => row.arm === "after")),
  };
});

writeFileSync(values.out, `${JSON.stringify({ schema: "slow-bench/1", run: values.run ?? "", cases }, null, 2)}\n`);
