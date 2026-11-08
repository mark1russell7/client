/**
 * The report of the fan-out bench: `--jobs <folder> --out <file> [--run <id>]`. This script pools the
 * records of the jobs. It writes the times of each case in both arms, with the A/A band of the same
 * run. The field `bound` is the high end of the 95 % interval of the ratio sliced/plain, times the
 * high end of the A/A band.
 *
 * The field `worstMs` of a `block` case is the budget candidate: the worst sliced time of all rounds.
 *
 * The field `growth` is the growth gate (`fan-out-growth.ts`). The script `fan-out-gate.ts` fails the job when it does not pass.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { type GrowthVerdict, aaBand, caseIntervals, poolRecords, pooledVerdict, type PairedTime } from "@mark1russell7/rigor-bench";
import { median } from "@mark1russell7/rigor-statistics";
import { type GrowthSkip, fanOutGrowth } from "./fan-out-growth.js";

interface JobFile {
  readonly job: string;
  readonly env: unknown;
  readonly candidate: readonly PairedTime[];
  readonly aa: readonly PairedTime[];
  /** The cases that the job skipped. A job file of an older run has no list. */
  readonly skipped?: readonly GrowthSkip[];
}

const { values } = parseArgs({ options: { jobs: { type: "string" }, out: { type: "string" }, run: { type: "string" } } });
if (values.jobs === undefined || values.out === undefined) throw new RangeError("this report needs --jobs and --out");

const folder = values.jobs;
const jobs = readdirSync(folder)
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(readFileSync(join(folder, name), "utf8")) as JobFile);

const records = jobs.map(({ job, candidate, aa, skipped }) => ({ job, candidate, aa, ...(skipped === undefined ? {} : { skipped }) }));
const pool = poolRecords(records);
const verdict = pooledVerdict(records);
const band = aaBand(pool.aa);

const round = (value: number, digits: number): number => Number(value.toFixed(digits));

const timesOf = (id: string, arm: "a" | "b"): number[] => pool.candidate.filter((record) => record.case === id).map((record) => record[arm]);

const cases = caseIntervals(pool.candidate).map((entry) => ({
  case: entry.case,
  plainMs: round(median(timesOf(entry.case, "a")), 3),
  slicedMs: round(median(timesOf(entry.case, "b")), 3),
  worstMs: round(Math.max(...timesOf(entry.case, "b")), 3),
  ratio: round(entry.ratio, 4),
  low: round(entry.low, 4),
  high: round(entry.high, 4),
  bound: round(entry.high * band.high, 4),
  rounds: entry.rounds,
}));

const growth = fanOutGrowth(jobs);
const steps = (verdict: GrowthVerdict) =>
  verdict.steps.map((step) => ({ from: step.from, to: step.to, median: round(step.median, 2), low: round(step.low, 2), high: round(step.high, 2), exponent: round(step.exponent, 3), outcome: step.outcome, growths: step.growths.map((g) => round(g, 2)) }));

const report = {
  schema: "fan-out-bench/1",
  run: values.run ?? "",
  aa: { noise: round(band.noise, 4), high: round(band.high, 3), median: round(band.median, 3), cases: band.cases },
  verdict: { outcome: verdict.outcome, reason: verdict.reason },
  cases,
  growth: {
    outcome: growth.outcome,
    reason: growth.reason ?? "",
    gate: growth.gate && { plain: steps(growth.gate.plain), sliced: steps(growth.gate.sliced) },
    report: growth.report && { plain: steps(growth.report.plain), sliced: steps(growth.report.sliced) },
  },
  env: jobs.map(({ job, env }) => ({ job, env })),
};
writeFileSync(values.out, `${JSON.stringify(report, null, 2)}\n`);
