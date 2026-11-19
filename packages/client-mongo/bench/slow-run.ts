/**
 * One job of the slow partition bench (roadmap CLI-97): `--job <n> --rounds <n> --cap <seconds> --out <file>`.
 * Each arm of each case and round runs in a fresh process, one at a time.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { benchEnv, freshRun } from "@mark1russell7/rigor-bench/fresh";
import { SLOW_CASES } from "./slow-cases.js";

const { values } = parseArgs({ options: { job: { type: "string" }, rounds: { type: "string" }, cap: { type: "string" }, out: { type: "string" } } });
const job = Number(values.job);
const rounds = Number(values.rounds);
const cap = values.cap;
if (!Number.isInteger(job) || !Number.isInteger(rounds) || cap === undefined || values.out === undefined) throw new RangeError("this job needs --job, --rounds, --cap and --out");

const counts = `${values.out}.counts.jsonl`;
mkdirSync(dirname(values.out), { recursive: true });

const arm = (id: string): { id: string; command: string[] } => ({ id, command: [process.execPath, "--import", "tsx", "bench/slow-arm.ts", "--arm", id, "--job", String(job), "--counts", counts, "--cap", cap] });

const run = await freshRun({
  base: arm("before"),
  candidates: [arm("after")],
  cases: [...SLOW_CASES],
  rounds,
  roundOffset: (job - 1) * rounds,
  job: String(job),
  timeoutMs: (Number(cap) * 3 + 120) * 1000,
});

writeFileSync(values.out, `${JSON.stringify({ job: String(job), env: benchEnv(), candidate: run.pairs["after"], aa: run.pairs["before~aa"] })}\n`);
