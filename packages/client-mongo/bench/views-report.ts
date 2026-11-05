/**
 * The report of the bench of different views at the top rung: `--jobs <folder> --out <file> [--run <id>]`.
 * This script gives the median and the worst of each figure over all starts of all jobs.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { median } from "@mark1russell7/rigor-statistics";
import type { StreamCount } from "./stream-cases.js";

/** The figures of the report. */
const MEASURES = ["readyMs", "streams", "connections", "idleGetMore", "deliverMs", "burstMs", "burstProbeMs", "burstConnections", "burstBlockMs", "clientMb", "serverMb"] as const;

const { values } = parseArgs({ options: { jobs: { type: "string" }, out: { type: "string" }, run: { type: "string" } } });
if (values.jobs === undefined || values.out === undefined) throw new RangeError("this report needs --jobs and --out");

const folder = values.jobs;
const rows = readdirSync(folder)
  .filter((name) => name.endsWith(".jsonl"))
  .flatMap((name) => readFileSync(join(folder, name), "utf8").trim().split("\n"))
  .map((line) => JSON.parse(line) as StreamCount);
const finished = rows.filter((row) => row.ready);

const round = (value: number): number => Number(value.toFixed(1));
const spread = (measure: (typeof MEASURES)[number]) => {
  const list = (measure === "readyMs" || measure === "streams" ? rows : finished).map((row) => row[measure]);
  return list.length === 0 ? null : { median: round(median(list)), worst: round(Math.max(...list)) };
};

const report = {
  schema: "views-bench/1",
  run: values.run ?? "",
  partitions: rows[0]?.partitions,
  starts: rows.length,
  readyWithinCap: finished.length,
  burstsEnded: finished.filter((row) => row.burstEnded).length,
  distinctPipelines: rows[0]?.distinctPipelines,
  measures: Object.fromEntries(MEASURES.map((measure) => [measure, spread(measure)])),
};
writeFileSync(values.out, `${JSON.stringify(report, null, 2)}\n`);
