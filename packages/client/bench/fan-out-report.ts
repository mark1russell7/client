/**
 * The report of the fan-out bench: `--jobs <folder> --out <file> [--run <id>]`. This script pools the
 * records of the jobs. It writes the times of each case in both arms, with the A/A band of the same
 * run. The field `bound` is the high end of the 95 % interval of the ratio sliced/plain, times the
 * high end of the A/A band.
 *
 * A run with fewer than 5 A/A cases gives no band. Then the field `aa` shows no read with its reason,
 * and each `bound` is null. A skipped case of the A/A arm gives such a run.
 *
 * The field `worstMs` of a `block` case is the budget candidate: the worst sliced time of all rounds.
 *
 * The fields `plainGcMs` and `slicedGcMs` are the median GC time of a child in its timed publishes, over all rounds.
 * The fields `plainGcMaxMs` and `slicedGcMaxMs` are the median of the longest GC event of a child. The field
 * `blockLessGcMs` of a `block` case is the median of the sliced block of a child less its longest GC event: a value of
 * 0 or less tells that one GC event explains the block. `fan-out-gc.ts` reads each child.
 * A job file of an older run has no GC time or no longest GC event. Then the field is null.
 *
 * The field `growth` is the growth gate (`fan-out-growth.ts`). The script `fan-out-gate.ts` fails the job when it does not pass.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { type GrowthVerdict, aaBand, caseIntervals, caseRatios, poolRecords, pooledVerdict, type PairedTime } from "@mark1russell7/rigor-bench";
import type { ChildFields } from "@mark1russell7/rigor-bench/fresh";
import { median } from "@mark1russell7/rigor-statistics";
import { parseCase } from "./fan-out-cases.js";
import { blockLessGc, childGc } from "./fan-out-gc.js";
import { type GrowthSkip, fanOutGrowth } from "./fan-out-growth.js";

/** A record of a job file. A record of a child that gives fields has them, as `freshRun` writes them. */
type JobRecord = PairedTime & { readonly fields?: { readonly a: ChildFields; readonly b: ChildFields } };

interface JobFile {
  readonly job: string;
  /** The computer of the job, as `benchEnv` gives it. A job file of an older run has no computer. */
  readonly env?: { readonly cpu: string };
  readonly candidate: readonly JobRecord[];
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
/** The fewest A/A cases that give a band: the 5-seed rule of `aaBand`. */
const AA_MINIMUM = 5;
const aaCases = caseRatios(pool.aa).length;
const band = aaCases >= AA_MINIMUM ? aaBand(pool.aa, { minimum: AA_MINIMUM }) : undefined;

const round = (value: number, digits: number): number => Number(value.toFixed(digits));

const timesOf = (id: string, arm: "a" | "b"): number[] => pool.candidate.filter((record) => record.case === id).map((record) => record[arm]);

/** The median of one read of each child of a case. A case with no read gives null. */
const medianOf = (id: string, read: (record: JobRecord) => number | undefined): number | null => {
  const values = jobs
    .flatMap((job) => job.candidate)
    .filter((record) => record.case === id)
    .flatMap((record) => {
      const value = read(record);
      return value === undefined ? [] : [value];
    });
  return values.length === 0 ? null : round(median(values), 3);
};

const cases = caseIntervals(pool.candidate).map((entry) => ({
  case: entry.case,
  plainMs: round(median(timesOf(entry.case, "a")), 3),
  slicedMs: round(median(timesOf(entry.case, "b")), 3),
  worstMs: round(Math.max(...timesOf(entry.case, "b")), 3),
  plainGcMs: medianOf(entry.case, (record) => childGc(record.fields?.a)?.sumMs),
  slicedGcMs: medianOf(entry.case, (record) => childGc(record.fields?.b)?.sumMs),
  plainGcMaxMs: medianOf(entry.case, (record) => childGc(record.fields?.a)?.maxMs),
  slicedGcMaxMs: medianOf(entry.case, (record) => childGc(record.fields?.b)?.maxMs),
  ...(parseCase(entry.case).measure === "block" ? { blockLessGcMs: medianOf(entry.case, (record) => blockLessGc(record.b, record.fields?.b)) } : {}),
  ratio: round(entry.ratio, 4),
  low: round(entry.low, 4),
  high: round(entry.high, 4),
  bound: band === undefined ? null : round(entry.high * band.high, 4),
  rounds: entry.rounds,
}));

const growth = fanOutGrowth(jobs);
const steps = (verdict: GrowthVerdict) =>
  verdict.steps.map((step) => ({ from: step.from, to: step.to, median: round(step.median, 2), low: round(step.low, 2), high: round(step.high, 2), exponent: round(step.exponent, 3), outcome: step.outcome, growths: step.growths.map((g) => round(g, 2)) }));

const report = {
  schema: "fan-out-bench/1",
  run: values.run ?? "",
  aa:
    band === undefined
      ? { read: "none", reason: `the A/A arm has ${aaCases} cases, and a band needs ${AA_MINIMUM} or more`, cases: aaCases }
      : { noise: round(band.noise, 4), high: round(band.high, 3), median: round(band.median, 3), cases: band.cases },
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
