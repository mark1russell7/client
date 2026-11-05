/**
 * The limit of the speed gate of the store (roadmap CLI-94): `<folder>...`, one folder of job files for each CI run of one source.
 * This script prints the smallest limit that passes each run, and the worst plus the spread of these limits.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { JobRecords } from "@mark1russell7/rigor-bench";
import { joinJobs, passingLimit } from "./gate-verdict.js";

const runs = process.argv.slice(2);
if (runs.length === 0) throw new RangeError("this script needs one folder for each run");
const limits = runs.map((folder) => {
  const files = readdirSync(folder).filter((name) => /^job-.*\.json$/.test(name));
  return passingLimit(joinJobs(files.map((name) => JSON.parse(readFileSync(join(folder, name), "utf8")) as JobRecords)));
});
const worst = Math.max(...limits);
const least = Math.min(...limits);
console.log(JSON.stringify({ runs: Object.fromEntries(runs.map((folder, i) => [folder, limits[i]])), worst, least, limit: worst + (worst - least) }, null, 2));
