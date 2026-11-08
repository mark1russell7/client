/**
 * The growth gate of the fan-out bench: `--jobs <folder>`. This script reads the job files and gives the growth gate of
 * `fan-out-growth.ts`. It fails when the outcome is `block` or `no read`, because a `no read` is not a pass.
 *
 * The gate reads the job files and not the report, because the run of a pull request times only the case `total`. The
 * A/A band of the report needs five cases or more, and the growth gate needs no band: it reads ratios inside each job.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { type GrowthJob, fanOutGrowth } from "./fan-out-growth.js";

const { values } = parseArgs({ options: { jobs: { type: "string" } } });
if (values.jobs === undefined) throw new RangeError("this gate needs --jobs");
const folder = values.jobs;
const jobs = readdirSync(folder)
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(readFileSync(join(folder, name), "utf8")) as GrowthJob);
const growth = fanOutGrowth(jobs);
for (const arm of ["plain", "sliced"] as const) {
  for (const step of growth.gate?.[arm].steps ?? []) {
    console.log(`${arm} ${step.from} to ${step.to}: ${step.median.toFixed(2)}x (${step.low.toFixed(2)} to ${step.high.toFixed(2)}), each job ${step.growths.map((g) => g.toFixed(2)).join(" ")}`);
  }
}
console.log(`fan-out growth gate over ${jobs.length} jobs: ${growth.outcome}${growth.reason === undefined ? "" : `: ${growth.reason}`}`);
if (growth.outcome !== "pass") process.exitCode = 1;
