/**
 * One job of the bench of different views at the top rung (roadmap CLI-94): `--job <n> --rounds <n> --cap <seconds> --out <file>`.
 * Each partition has a view with its own pipeline text, because equal text can hide a cache or a shared plan.
 * Each start is a fresh process of the source of this tree. The job has only the A/A pair, because the rung has no arm before.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { benchEnv, freshRun } from "@mark1russell7/rigor-bench/fresh";
import { TOP_RUNG, caseId } from "./stream-cases.js";

const { values } = parseArgs({ options: { job: { type: "string" }, rounds: { type: "string" }, cap: { type: "string" }, out: { type: "string" } } });
const job = Number(values.job);
const rounds = Number(values.rounds);
const cap = values.cap;
if (!Number.isInteger(job) || !Number.isInteger(rounds) || cap === undefined || values.out === undefined) throw new RangeError("this job needs --job, --rounds, --cap and --out");

const counts = `${values.out}.counts.jsonl`;
mkdirSync(dirname(values.out), { recursive: true });

const run = await freshRun({
  base: { id: "after", command: [process.execPath, "--import", "tsx", "bench/stream-arm.ts", "--arm", "after", "--job", String(job), "--counts", counts, "--cap", cap, "--family", "varied"] },
  candidates: [],
  cases: [caseId(TOP_RUNG)],
  rounds,
  roundOffset: (job - 1) * rounds,
  job: String(job),
  timeoutMs: (Number(cap) * 3 + 120) * 1000,
});

writeFileSync(values.out, `${JSON.stringify({ job: String(job), env: benchEnv(), aa: run.pairs["after~aa"] })}\n`);
