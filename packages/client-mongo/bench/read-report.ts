/**
 * The report of the change read bench: `--jobs <folder> --out <file> [--run <id>]`. This script pools
 * the jobs, and writes for each arm and case the median and the worst of each measure. It also writes
 * the interval of the ratio candidate/base of the time of a burst, and the A/A band of the same run. The field
 * `base` gives the arm of each pair: with `before`, the candidate is `after`, and with `after`, the candidate is `before`.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { aaBand, caseIntervals, poolRecords, type PairedTime } from "@mark1russell7/rigor-bench";
import { median } from "@mark1russell7/rigor-statistics";
import type { ReadCount } from "./read-cases.js";

interface JobFile {
  readonly job: string;
  readonly env: unknown;
  /** The arm of each pair. A job of the suite `read` has no field, and its base is `before`. */
  readonly base?: string;
  readonly candidate: readonly PairedTime[];
  readonly aa: readonly PairedTime[];
  /** The other arms of the suite `read-bound`, by arm. */
  readonly shares?: Readonly<Record<string, readonly PairedTime[]>>;
}

const { values } = parseArgs({ options: { jobs: { type: "string" }, out: { type: "string" }, run: { type: "string" }, delay: { type: "string" } } });
if (values.jobs === undefined || values.out === undefined) throw new RangeError("this report needs --jobs and --out");
const delay = Number(values.delay ?? "0");
if (!Number.isInteger(delay) || delay < 0) throw new RangeError(`--delay must be a whole number of milliseconds, not ${String(values.delay)}`);

const folder = values.jobs;
const names = readdirSync(folder);
const jobs = names.filter((name) => name.endsWith(".json")).map((name) => JSON.parse(readFileSync(join(folder, name), "utf8")) as JobFile);
const counts = names
  .filter((name) => name.endsWith(".jsonl"))
  .flatMap((name) => readFileSync(join(folder, name), "utf8").trim().split("\n"))
  .map((line) => JSON.parse(line) as ReadCount);

const round = (value: number, digits: number): number => Number(value.toFixed(digits));

const MEASURES = ["burstMs", "readsPerSecond", "commands", "writes", "probeMs", "probeP50Ms", "probeP95Ms", "otherMs", "otherP50Ms", "otherP95Ms", "loopMaxMs", "connections", "roundTripMs"] as const;

const groups = new Map<string, ReadCount[]>();
for (const row of counts) {
  const key = `${row.case}-${row.arm}`;
  groups.set(key, [...(groups.get(key) ?? []), row]);
}

const cells = [...groups.values()]
  .sort((a, b) => a[0]!.case.localeCompare(b[0]!.case) || a[0]!.arm.localeCompare(b[0]!.arm))
  .map((rows) => ({
    case: rows[0]!.case,
    arm: rows[0]!.arm,
    children: rows.length,
    measures: Object.fromEntries(
      MEASURES.map((measure) => {
        const list = rows.map((row) => row[measure]);
        return [measure, { median: round(median(list), 1), low: round(Math.min(...list), 1), high: round(Math.max(...list), 1) }];
      })
    ),
  }));

/** The objective of the limit of change reads (roadmap CLI-91): the p95 of other queries of the pool in a burst, in round trips. */
const OBJECTIVE_ROUND_TRIPS = 1.5;

/**
 * The delay of the gate in milliseconds. At this delay the connections wait on the network, so the share of the pool controls the p95.
 * At a short round trip the work of the server sets the p95 of each client. There the row only reports (runs 42042004506 to 42105731536).
 */
const GATE_DELAY_MS = 20;

/** The quiet p95 of the probe for each job and case: the median of the arm `before`, which reads one item at a time. */
const quiet = new Map<string, number>();
for (const rows of groups.values()) {
  if (rows[0]!.arm !== "before") continue;
  for (const job of new Set(rows.map((row) => row.job))) quiet.set(`${job}|${rows[0]!.case}`, median(rows.filter((row) => row.job === job).map((row) => row.probeP95Ms)));
}

/**
 * The objective row gives, for each arm and case, the p95 of the probe of the same pool over the round trip.
 * It gives the median and the worst job. The field `quiet` is the p95 over the quiet p95 of the same job and case.
 * The row `holds` is true when the median stays within `OBJECTIVE_ROUND_TRIPS`. A later change of the share is read against this row.
 */
const objective = {
  roundTrips: OBJECTIVE_ROUND_TRIPS,
  delayMs: delay,
  gate: delay === GATE_DELAY_MS,
  rows: cells
    .filter((cell) => cell.arm !== "before")
    .map((cell) => {
      const trip = cell.measures["roundTripMs"]!.median;
      const p95 = cell.measures["probeP95Ms"]!;
      const ratio = round(p95.median / trip, 2);
      const quiets = (groups.get(`${cell.case}-${cell.arm}`) ?? []).flatMap((row) => {
        const base = quiet.get(`${row.job}|${row.case}`);
        return base === undefined ? [] : [row.probeP95Ms / base];
      });
      return {
        arm: cell.arm,
        case: cell.case,
        roundTripMs: trip,
        p95Ms: p95.median,
        ratio,
        worst: round(p95.high / trip, 2),
        quiet: quiets.length > 0 ? round(median(quiets), 2) : null,
        holds: ratio <= OBJECTIVE_ROUND_TRIPS,
      };
    }),
};

const pool = poolRecords(jobs.map(({ job, candidate, aa }) => ({ job, candidate, aa })));
const band = aaBand(pool.aa);

const report = {
  schema: "read-bench/1",
  run: values.run ?? "",
  base: [...new Set(jobs.map((job) => job.base ?? "before"))].join(" "),
  aa: { noise: round(band.noise, 4), high: round(band.high, 3), median: round(band.median, 3), cases: band.cases },
  burst: caseIntervals(pool.candidate).map((entry) => ({
    case: entry.case,
    ratio: round(entry.ratio, 4),
    low: round(entry.low, 4),
    high: round(entry.high, 4),
    bound: round(entry.high * band.high, 4),
    rounds: entry.rounds,
  })),
  shares: Object.fromEntries(
    [...new Set(jobs.flatMap((job) => Object.keys(job.shares ?? {})))].map((share) => [
      share,
      caseIntervals(poolRecords(jobs.map(({ job, shares, aa }) => ({ job, candidate: shares?.[share] ?? [], aa }))).candidate).map((entry) => ({
        case: entry.case,
        ratio: round(entry.ratio, 4),
        low: round(entry.low, 4),
        high: round(entry.high, 4),
        rounds: entry.rounds,
      })),
    ]),
  ),
  objective,
  cells,
  env: jobs.map(({ job, env }) => ({ job, env })),
};
writeFileSync(values.out, `${JSON.stringify(report, null, 2)}\n`);

for (const row of objective.rows) console.log(`${row.arm} ${row.case}: p95 ${String(row.p95Ms)} ms, ${String(row.ratio)} round trips (worst job ${String(row.worst)}), ${String(row.quiet)} x quiet${row.holds ? "" : ", over the objective"}`);
const misses = objective.rows.filter((row) => row.arm === "after" && !row.holds);
if (objective.gate && misses.length > 0) {
  console.error(`BLOCK: at ${String(delay)} ms the arm after is over ${String(OBJECTIVE_ROUND_TRIPS)} round trips in ${misses.map((row) => row.case).join(", ")}.`);
  process.exitCode = 1;
} else console.log(objective.gate ? `PASS: at ${String(delay)} ms the arm after is within ${String(OBJECTIVE_ROUND_TRIPS)} round trips in each case.` : `REPORT ONLY: the gate reads only a delay of ${String(GATE_DELAY_MS)} ms.`);
