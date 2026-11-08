/**
 * The growth gate of the fan-out bench: `--jobs <folder>`. This script reads the job files and gives the growth gate of
 * `fan-out-growth.ts`. It fails when the outcome is `block` or `no read`, because a `no read` is not a pass. An error
 * annotation on the check line names the outcome, its cases and the CPU models of the jobs.
 *
 * The gate reads the job files and not the report, because the run of a pull request times only the case `total`. The
 * A/A band of the report needs five cases or more, and the growth gate needs no band: it reads ratios inside each job.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { type JobModel, noReadLine, writeNoRead } from "@mark1russell7/rigor-bench";
import { parseCase } from "./fan-out-cases.js";
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
// The check line names an outcome that is not a pass, so a no read is not only in the log
const counts = new Map<string, number>();
for (const { env } of jobs) if (env !== undefined) counts.set(env.cpu, (counts.get(env.cpu) ?? 0) + 1);
const models: JobModel[] = [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([model, count]) => ({ model, jobs: count }));
const named = jobs.flatMap(({ candidate, skipped }) => [...candidate.map((record) => record.case), ...(skipped ?? []).map((skip) => skip.case)]);
const gated = [...new Set([...named.filter((id) => parseCase(id).measure === "total"), ...growth.cases])].sort();
if (growth.outcome === "no read") {
  const reads = gated.map((id) => ({ case: id, outcome: growth.cases.includes(id) ? "no read" : "within" }));
  writeNoRead(noReadLine(reads, { title: "The fan-out growth gate", reason: growth.reason, models }), { level: "error" });
} else if (growth.outcome === "block") {
  const data = `${growth.reason ?? "a step grows beyond the limit"}. Cases: ${growth.cases.join(", ")}.`.replaceAll("%", "%25").replaceAll("\n", "%0A");
  console.log(`::error title=The fan-out growth gate blocks::${data}`);
}
if (growth.outcome !== "pass") process.exitCode = 1;
