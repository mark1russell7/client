/**
 * One job of the delete bench (roadmap CLI-98): `--job <n> --rounds <n> --cap <seconds> --out <file>`.
 * Each start is a fresh process of the source of this tree. The job has only the A/A pair, because the bench compares the routes of one build.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { benchEnv, freshRun } from "@mark1russell7/rigor-bench/fresh";
import { DELETE_CASES } from "./delete-cases.js";

const { values } = parseArgs({ options: { job: { type: "string" }, rounds: { type: "string" }, cap: { type: "string" }, out: { type: "string" } } });
const job = Number(values.job);
const rounds = Number(values.rounds);
const cap = values.cap;
if (!Number.isInteger(job) || !Number.isInteger(rounds) || cap === undefined || values.out === undefined) throw new RangeError("this job needs --job, --rounds, --cap and --out");

const counts = `${values.out}.counts.jsonl`;
mkdirSync(dirname(values.out), { recursive: true });

const run = await freshRun({
  base: { id: "after", command: [process.execPath, "--import", "tsx", "bench/delete-arm.ts", "--arm", "after", "--job", String(job), "--counts", counts, "--cap", cap] },
  candidates: [],
  cases: [...DELETE_CASES],
  rounds,
  roundOffset: (job - 1) * rounds,
  job: String(job),
  timeoutMs: (Number(cap) * 3 + 120) * 1000,
});

writeFileSync(values.out, `${JSON.stringify({ job: String(job), env: benchEnv(), aa: run.pairs["after~aa"] })}\n`);
