/**
 * The read of the suite `gate-many` (roadmap CLI-94): `--jobs <folder> --out <file> [--run <id>]`.
 * For each job and each number of rounds, the report gives the median and the spread of the no-fault arm and of the flip.
 * Each figure is the time of a head over its base, over the same ratio of the A/A row of that round.
 * The limit and the held slowdown come from the records of 5 or more runs, not from this report.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { median, quantile } from "@mark1russell7/rigor-statistics";
import type { JobRecords, PairedTime } from "@mark1russell7/rigor-bench";

interface ManyFile extends JobRecords {
  readonly flip: readonly PairedTime[];
}

/** The numbers of rounds that the report reads. */
const LOOKS = [24, 36, 48, 72, 96] as const;

const { values } = parseArgs({ options: { jobs: { type: "string" }, out: { type: "string" }, run: { type: "string" } } });
if (values.jobs === undefined || values.out === undefined) throw new RangeError("this report needs --jobs and --out");

const folder = values.jobs;
const files = readdirSync(folder)
  .filter((name) => /^job-.*\.json$/.test(name))
  .map((name) => JSON.parse(readFileSync(join(folder, name), "utf8")) as ManyFile);

const round = (value: number): number => Number(value.toFixed(4));
const inOrder = (rows: readonly PairedTime[]): PairedTime[] => [...rows].sort((x, y) => x.round - y.round);

/** This function gives the median and the middle 75 percent of a head over its A/A row, on the first rounds. */
function read(head: readonly PairedTime[], aa: readonly PairedTime[], look: number): { rows: number; ratio: number; low: number; high: number } | null {
  if (head.length < look || aa.length < look) return null;
  const twin = inOrder(aa);
  const diffs = inOrder(head)
    .slice(0, look)
    .map((row, index) => Math.log(row.b / row.a) - Math.log(twin[index]!.b / twin[index]!.a));
  return { rows: look, ratio: round(Math.exp(median(diffs))), low: round(Math.exp(quantile(diffs, 0.125))), high: round(Math.exp(quantile(diffs, 0.875))) };
}

const jobs = files.map((file) => ({
  job: file.job,
  env: file.env,
  rows: file.candidate.length,
  looks: LOOKS.map((look) => ({ look, noFault: read(file.candidate, file.aa, look), flip: read(file.flip, file.aa, look) })),
}));

writeFileSync(values.out, `${JSON.stringify({ schema: "store-gate-many/1", run: values.run, jobs }, null, 2)}\n`);
console.log(`The arm of one case of the store gate: ${jobs.length} jobs.`);
