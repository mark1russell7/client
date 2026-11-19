/**
 * The report of the delete bench: `--jobs <folder> --out <file> [--run <id>]`. This script gives the
 * median and the worst of each figure of each case over all starts, with the A/A interval of the case.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { caseIntervals, poolRecords, type PairedTime } from "@mark1russell7/rigor-bench";
import { median } from "@mark1russell7/rigor-statistics";
import { DELETE_CASES, type DeleteCount } from "./delete-cases.js";

const MEASURES = ["passesMs", "deleteMs", "sourceReads", "commands", "blockMs"] as const;

const { values } = parseArgs({ options: { jobs: { type: "string" }, out: { type: "string" }, run: { type: "string" } } });
if (values.jobs === undefined || values.out === undefined) throw new RangeError("this report needs --jobs and --out");

const folder = values.jobs;
const names = readdirSync(folder);
const jobs = names.filter((name) => name.endsWith(".json")).map((name) => JSON.parse(readFileSync(join(folder, name), "utf8")) as { job: string; aa: readonly PairedTime[] });
const rows = names
  .filter((name) => name.endsWith(".jsonl"))
  .flatMap((name) => readFileSync(join(folder, name), "utf8").trim().split("\n"))
  .map((line) => JSON.parse(line) as DeleteCount);

const round = (value: number, digits = 1): number => Number(value.toFixed(digits));
const aa = new Map(caseIntervals(poolRecords(jobs.map(({ job, aa: records }) => ({ job, candidate: [], aa: records }))).aa).map((entry) => [entry.case, entry]));

/** This function adds the lines of the log of all starts of a case. */
function pooled(starts: readonly DeleteCount[]): Record<string, number> {
  const all: Record<string, number> = {};
  for (const row of starts) for (const [line, count] of Object.entries(row.logged)) all[line] = (all[line] ?? 0) + count;
  return all;
}

const cases = DELETE_CASES.map((id) => {
  const starts = rows.filter((row) => row.case === id);
  const interval = aa.get(id);
  return {
    case: id,
    starts: starts.length,
    ended: starts.filter((row) => row.ended).length,
    aa: interval ? { ratio: round(interval.ratio, 4), low: round(interval.low, 4), high: round(interval.high, 4) } : null,
    logged: pooled(starts),
    ...Object.fromEntries(
      MEASURES.map((measure) => {
        const list = starts.map((row) => row[measure]);
        return [measure, list.length === 0 ? null : { median: round(median(list)), worst: round(Math.max(...list)) }];
      })
    ),
  };
});

writeFileSync(values.out, `${JSON.stringify({ schema: "delete-bench/1", run: values.run ?? "", cases }, null, 2)}\n`);
