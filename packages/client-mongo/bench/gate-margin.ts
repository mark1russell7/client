/**
 * The limit of the speed gate of the store (roadmap CLI-94): `<folder>...`, one folder of job files for each CI run of one source.
 * This script prints the smallest limit that passes each run, and the worst plus the spread of these limits.
 * It refuses a run with records that stop before the last look, because that run gives only an upper bound.
 * It also prints the same formula for each case alone, and reads all cases together at these limits in each run.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { JobRecords } from "@mark1russell7/rigor-bench";
import { caseLimits, joinJobs, outcomeAtCaseLimits, passingLimit, shortOfLastLook } from "./gate-verdict.js";

const runs = process.argv.slice(2);
if (runs.length === 0) throw new RangeError("this script needs one folder for each run");
const read = runs.map((folder) => {
  const files = readdirSync(folder).filter((name) => /^job-.*\.json$/.test(name));
  const jobs = joinJobs(files.map((name) => JSON.parse(readFileSync(join(folder, name), "utf8")) as JobRecords));
  const short = shortOfLastLook(jobs);
  if (short.length > 0) throw new RangeError(`${folder} stops before the last look: ${short.join("; ")}`);
  return { folder, jobs, limit: passingLimit(jobs), cases: caseLimits(jobs) };
});
/** This function gives the worst of the values, the least, and the worst plus the spread. */
function formula(values: readonly number[]): { worst: number; least: number; limit: number } {
  const worst = Math.max(...values);
  const least = Math.min(...values);
  return { worst, least, limit: worst + (worst - least) };
}

const perCase = Object.fromEntries(Object.keys(read[0]?.cases ?? {}).map((name) => [name, formula(read.map((run) => run.cases[name] ?? Number.POSITIVE_INFINITY))]));
const caseLimit = Object.fromEntries(Object.entries(perCase).map(([name, value]) => [name, value.limit]));
console.log(
  JSON.stringify(
    {
      runs: Object.fromEntries(read.map((run) => [run.folder, run.limit])),
      ...formula(read.map((run) => run.limit)),
      perCase,
      togetherAtCaseLimits: Object.fromEntries(read.map((run) => [run.folder, outcomeAtCaseLimits(run.jobs, caseLimit)])),
    },
    null,
    2,
  ),
);
