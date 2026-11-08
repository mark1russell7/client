/**
 * The report of the bench of the live limits (roadmap CLI-101): `--jobs <folder> --out <file> [--run <id>]`. For each
 * case, the report gives the median and the worst of each measure over the children, and the spread of the A/A pair.
 * It also gives the full topics that fit under the heap limit. The report only reports: no limit comes from one run.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { aaBand, type PairedTime } from "@mark1russell7/rigor-bench";
import { median } from "@mark1russell7/rigor-statistics";
import { KEYS, LIMITS_CASES, STATE_BYTES, TOPICS, TOPIC_BYTES, VALUE_BYTES } from "./limits-cases.js";

const { values } = parseArgs({ options: { jobs: { type: "string" }, out: { type: "string" }, run: { type: "string" } } });
if (values.jobs === undefined || values.out === undefined) throw new RangeError("this report needs --jobs and --out");

const folder = values.jobs;
const files = readdirSync(folder);
const rows = files
  .filter((name) => name.endsWith(".counts.jsonl"))
  .flatMap((name) => readFileSync(join(folder, name), "utf8").trim().split("\n"))
  .filter((line) => line.length > 0)
  .map((line) => JSON.parse(line) as Record<string, unknown> & { case: string; heapLimit: number });
const jobs = files
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(readFileSync(join(folder, name), "utf8")) as { job: string; env: unknown; aa: PairedTime[] });

const round = (value: number, digits = 3): number => Number(value.toFixed(digits));

/** The median and the worst of each numeric field of the records of a case. */
function measures(own: ReadonlyArray<Record<string, unknown>>): Record<string, { median: number; min: number; max: number }> {
  const fields = new Set(own.flatMap((row) => Object.keys(row).filter((key) => typeof row[key] === "number")));
  return Object.fromEntries([...fields].sort().map((field) => {
    const found = own.map((row) => row[field]).filter((value): value is number => typeof value === "number");
    return [field, { median: round(median(found)), min: round(Math.min(...found)), max: round(Math.max(...found)) }];
  }));
}

const cases = LIMITS_CASES.map((name) => {
  const own = rows.filter((row) => row.case === name);
  return { case: name, children: own.length, measures: own.length > 0 ? measures(own) : {} };
});

const perKey = cases.find((entry) => entry.case === "heap-16384")?.measures["heapPerKey"]?.median;
const heapLimit = rows.length > 0 ? median(rows.map((row) => row.heapLimit)) : 0;
const fullTopic = perKey === undefined ? undefined : perKey * KEYS;
const band = aaBand(jobs.flatMap((job) => job.aa));

const report = {
  schema: "live-limits-bench/1",
  run: values.run ?? "",
  children: rows.length,
  heapLimit,
  fullTopicBytes: fullTopic === undefined ? null : Math.round(fullTopic),
  fullTopicsFit: fullTopic === undefined ? null : Math.floor(heapLimit / fullTopic),
  fullStateBytes: fullTopic === undefined ? null : Math.round(fullTopic * TOPICS),
  // The heap of a state at the limits of bytes of the fix: the heap of a key at the byte edge, for each value of that size
  topicLimitHeap: perKey === undefined ? null : Math.round((perKey * TOPIC_BYTES) / VALUE_BYTES),
  stateLimitHeap: perKey === undefined ? null : Math.round((perKey * STATE_BYTES) / VALUE_BYTES),
  stateLimitShareOfHeap: perKey === undefined || heapLimit === 0 ? null : round((perKey * STATE_BYTES) / VALUE_BYTES / heapLimit, 4),
  aa: { noise: round(band.noise, 4), high: round(band.high), median: round(band.median), cases: band.cases },
  cases,
  env: jobs.map(({ job, env }) => ({ job, env })),
};
writeFileSync(values.out, `${JSON.stringify(report, null, 2)}\n`);
console.log(`The bench of the live limits: ${rows.length} children in ${LIMITS_CASES.length} cases.`);
