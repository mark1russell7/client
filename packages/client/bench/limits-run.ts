/**
 * One job of the bench of the live limits (roadmap CLI-101): `--job <n> --rounds <n> --out <file>`. Each case of each
 * round runs in a fresh process. The bench has one arm: the job gives the A/A pair of it, for the noise of each case.
 * The records of each child go to `<out>.counts.jsonl`.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { benchEnv, freshRun } from "@mark1russell7/rigor-bench/fresh";
import { LIMITS_CASES } from "./limits-cases.js";

const { values } = parseArgs({ options: { job: { type: "string" }, rounds: { type: "string" }, out: { type: "string" } } });
const job = Number(values.job);
const rounds = Number(values.rounds);
if (!Number.isInteger(job) || !Number.isInteger(rounds) || values.out === undefined) throw new RangeError("this job needs --job, --rounds and --out");

mkdirSync(dirname(values.out), { recursive: true });
const counts = `${values.out}.counts.jsonl`;

const run = await freshRun({
  base: {
    id: "edge",
    command: [process.execPath, "--expose-gc", "--import", "tsx", "bench/limits-arm.ts", "--job", String(job), "--counts", counts],
  },
  candidates: [],
  cases: LIMITS_CASES,
  rounds,
  roundOffset: (job - 1) * rounds,
  job: String(job),
  timeoutMs: 120_000,
});

writeFileSync(values.out, `${JSON.stringify({ job: String(job), env: benchEnv(), aa: run.pairs["edge~aa"] })}\n`);
