/**
 * The verdict of the speed gate of the store (roadmap CLI-94): `--jobs <folder> --out <file> [--run <id>] [--pr <number>] [--enforce] [--more <file>]`.
 * This script reads the claim "not slower by more than the limit of the case" of `gate-limit.json` over the job files of the folder.
 * With `--enforce`, the exit code is 1 for a block and 2 for no read. With `--more`, the file takes the line `more=<cases>` for the next look.
 *
 * An annotation on the check line names each outcome that is not a pass. A run with no `--enforce` and no `--more` only reports, so
 * its outcome is a warning. The cases that only report give a warning at the last look. With `--enforce`, the step of `ci.yml`
 * gives the error of the gate.
 */

import { appendFileSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { gateAnnotation, gateOf, type PairedTime } from "@mark1russell7/rigor-bench";
import { caseClaim, joinJobs, overStated, passingLimit, READ_CASES, storeGate, WRITE_CASES, type GateLimit } from "./gate-verdict.js";
import { poolErrors, type KeptError } from "./write-cases.js";

/** The CI runs that a limit needs. */
const LEAST_RUNS = 5;

interface JobFile {
  readonly job: string;
  readonly env?: { readonly cpu: string };
  readonly candidate: readonly PairedTime[];
  readonly aa: readonly PairedTime[];
}

interface Count {
  readonly arm: string;
  readonly case: string;
  readonly failures?: number;
  readonly errors?: Readonly<Record<string, KeptError>>;
}

const { values } = parseArgs({ options: { jobs: { type: "string" }, out: { type: "string" }, run: { type: "string" }, pr: { type: "string" }, enforce: { type: "boolean" }, more: { type: "string" } } });
if (values.jobs === undefined || values.out === undefined) throw new RangeError("this report needs --jobs and --out");

const gate = JSON.parse(readFileSync(new URL("./gate-limit.json", import.meta.url), "utf8")) as GateLimit;
if (values.enforce === true && gate.runs.length < LEAST_RUNS) throw new RangeError(`the limit has ${gate.runs.length} CI runs beside it, and a gate needs ${LEAST_RUNS} or more`);
const over = overStated(gate);
if (values.enforce === true && over.length > 0) throw new RangeError(`the limits of ${over.join(", ")} do not hold their stated slowdowns`);

const folder = values.jobs;
const names = readdirSync(folder);
const jobs = names.filter((name) => name.endsWith(".json")).map((name) => JSON.parse(readFileSync(join(folder, name), "utf8")) as JobFile);
const counts = names
  .filter((name) => name.endsWith(".jsonl"))
  .flatMap((name) => readFileSync(join(folder, name), "utf8").trim().split("\n"))
  .map((line) => JSON.parse(line) as Count);

const round = (value: number): number => Number(value.toFixed(4));
const joined = joinJobs(jobs.map(({ job, candidate, aa }) => ({ job, candidate, aa })));
const failures = counts.filter((row) => row.arm === "after").reduce((sum, row) => sum + (row.failures ?? 0), 0);
const attempt = Number(process.env["GITHUB_RUN_ATTEMPT"] ?? 1);
const result = storeGate(joined, { limits: gate.limits, reportOnly: gate.reportOnly, failures, attempt });
const { verdict } = result;
const caseRead = (entry: (typeof verdict.cases)[number]) => ({
  case: entry.case,
  read: entry.read,
  outcome: entry.outcome,
  look: entry.look,
  jobs: entry.jobs.map((job) => ({ job: job.job, rounds: job.rounds, below: job.below, above: job.above, centre: job.centre === undefined ? undefined : round(job.centre) })),
});

const report = {
  schema: "store-gate/3",
  run: values.run ?? "",
  pr: values.pr ?? "",
  attempt,
  outcome: result.outcome,
  text: result.text,
  limit: gate,
  level: verdict.level,
  looks: verdict.looks,
  need: verdict.need,
  more: result.more,
  passingLimit: round(passingLimit(joined)),
  cases: verdict.cases.map(caseRead),
  claims: [...READ_CASES, ...WRITE_CASES].map((name) => caseClaim(gate.flips ?? [], name)),
  reportOnly: result.reported.map(caseRead),
  failedWritesOfHead: failures,
  errorsOfHead: poolErrors(counts.filter((row) => row.arm === "after")),
  env: jobs.map(({ job, env }) => ({ job, env })),
};
writeFileSync(values.out, `${JSON.stringify(report, null, 2)}\n`);

console.log(result.text);
for (const claim of report.claims) {
  const head = claim.claim === null ? `${claim.case}: no claim yet` : `${claim.case}: claim ${String(claim.claim)}`;
  console.log(`${head}, held in ${String(claim.k)} of ${String(claim.n)} flip runs, Wilson low ${String(claim.wilsonLow)} (${claim.record || "no flip run"})`);
  for (const line of claim.breaks) console.log(`${claim.case}: detection does not rise with the slowdown: ${line}`);
}
// A look with --more is not the last look, so its outcome is not final
const envs = jobs.flatMap(({ env }) => (env === undefined ? [] : [env]));
const last = values.enforce === true || values.more === undefined;
const cases = gateOf(verdict.cases);
const gateLine = values.enforce === true || !last ? undefined : gateAnnotation({ gate: "The speed gate of the store", outcome: result.outcome, reason: result.text, cases: result.outcome === "block" ? cases.blocks : cases.noRead, envs, enforced: false });
const reported = gateOf(result.reported);
const reportedLine = !last || result.reported.length === 0 ? undefined : gateAnnotation({ gate: "The report-only cases of the store gate", outcome: reported.outcome, reason: reported.reason, cases: reported.outcome === "block" ? reported.blocks : reported.noRead, envs, enforced: false });
for (const line of [gateLine, reportedLine]) if (line !== undefined) console.log(line);
if (values.more !== undefined && result.more.length > 0) appendFileSync(values.more, `more=${result.more.join(",")}\n`);
if (values.enforce === true) process.exitCode = result.exitCode;
