/**
 * The verdict of the speed gate of the store (roadmap CLI-94): `--jobs <folder> --out <file> [--run <id>] [--enforce]`.
 * This script pools the jobs and compares the ratio head/base of each case with the limit in `gate-limit.json`.
 * With `--enforce`, the exit code is 1 when a case is not within the limit or when a write of the head fails.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { pooledLimitVerdict, type PairedTime } from "@mark1russell7/rigor-bench";
import { poolErrors, type KeptError } from "./write-cases.js";

/** The CI runs that a limit needs. */
const LEAST_RUNS = 5;

interface JobFile {
  readonly job: string;
  readonly env: unknown;
  readonly candidate: readonly PairedTime[];
  readonly aa: readonly PairedTime[];
}

interface Count {
  readonly arm: string;
  readonly case: string;
  readonly failures?: number;
  readonly errors?: Readonly<Record<string, KeptError>>;
}

interface GateLimit {
  readonly limit: number;
  readonly formula: string;
  readonly runs: readonly string[];
}

const { values } = parseArgs({ options: { jobs: { type: "string" }, out: { type: "string" }, run: { type: "string" }, enforce: { type: "boolean" } } });
if (values.jobs === undefined || values.out === undefined) throw new RangeError("this report needs --jobs and --out");

const gate = JSON.parse(readFileSync(new URL("./gate-limit.json", import.meta.url), "utf8")) as GateLimit;
if (values.enforce === true && gate.runs.length < LEAST_RUNS) throw new RangeError(`the limit has ${gate.runs.length} CI runs beside it, and a gate needs ${LEAST_RUNS} or more`);

const folder = values.jobs;
const names = readdirSync(folder);
const jobs = names.filter((name) => name.endsWith(".json")).map((name) => JSON.parse(readFileSync(join(folder, name), "utf8")) as JobFile);
const counts = names
  .filter((name) => name.endsWith(".jsonl"))
  .flatMap((name) => readFileSync(join(folder, name), "utf8").trim().split("\n"))
  .map((line) => JSON.parse(line) as Count);

const round = (value: number): number => Number(value.toFixed(4));
const verdict = pooledLimitVerdict(jobs.map(({ job, candidate, aa }) => ({ job, candidate, aa })), { limit: gate.limit });
const failures = counts.filter((row) => row.arm === "after").reduce((sum, row) => sum + (row.failures ?? 0), 0);
const { band, cases } = verdict.pooled;

const report = {
  schema: "store-gate/1",
  run: values.run ?? "",
  outcome: verdict.outcome,
  reason: verdict.reason,
  limit: gate,
  aa: band === undefined ? undefined : { noise: round(band.noise), high: round(band.high), median: round(band.median), cases: band.cases },
  cases: cases.map((entry) => ({ case: entry.case, ratio: round(entry.ratio), low: round(entry.low), high: round(entry.high), bound: round(entry.bound), floor: round(entry.floor), rounds: entry.rounds, outcome: entry.outcome })),
  worstBound: round(Math.max(...cases.map((entry) => entry.bound))),
  failedWritesOfHead: failures,
  errorsOfHead: poolErrors(counts.filter((row) => row.arm === "after")),
  dropped: verdict.dropped,
  env: jobs.map(({ job, env }) => ({ job, env })),
};
writeFileSync(values.out, `${JSON.stringify(report, null, 2)}\n`);

const passed = verdict.outcome === "within" && failures === 0 && verdict.dropped.length === 0;
console.log(`${passed ? "PASS" : "FAIL"}: ${verdict.reason} Failed writes of the head: ${failures}. Dropped cases: ${verdict.dropped.length}.`);
if (values.enforce === true && !passed) process.exitCode = 1;
