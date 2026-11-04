/**
 * One job of the stream bench: `--job <n> --rounds <n> --cap <seconds> --out <file>`. Each arm of each
 * case and round runs in a fresh process, one at a time, because the counters of the server are global.
 *
 * - At the rungs of `PAIRED_RUNGS`, the job has the pair (before, after) and its A/A pair.
 * - At the top rung, a start before the change ends at the cap. A pair there spends the job on the
 *   cap, so the job has the A/A pair of `after`, and one start before the change on the default pool
 *   and one on a wide pool.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { benchEnv, freshRun } from "@mark1russell7/rigor-bench/fresh";
import { PAIRED_RUNGS, TOP_RUNG, WIDE_POOL, caseId } from "./stream-cases.js";

const { values } = parseArgs({ options: { job: { type: "string" }, rounds: { type: "string" }, cap: { type: "string" }, out: { type: "string" } } });
const job = Number(values.job);
const rounds = Number(values.rounds);
const cap = values.cap;
if (!Number.isInteger(job) || !Number.isInteger(rounds) || cap === undefined || values.out === undefined) throw new RangeError("this job needs --job, --rounds, --cap and --out");

const counts = `${values.out}.counts.jsonl`;
mkdirSync(dirname(values.out), { recursive: true });

const command = (id: string): string[] => [process.execPath, "--import", "tsx", "bench/stream-arm.ts", "--arm", id, "--job", String(job), "--counts", counts, "--cap", cap];
const arm = (id: string): { id: string; command: string[] } => ({ id, command: command(id) });

const timeoutMs = (Number(cap) * 3 + 120) * 1000;
const roundOffset = (job - 1) * rounds;

const paired = await freshRun({
  base: arm("before"),
  candidates: [arm("after")],
  cases: PAIRED_RUNGS.map(caseId),
  rounds,
  roundOffset,
  job: String(job),
  timeoutMs,
});
const top = await freshRun({ base: arm("after"), candidates: [], cases: [caseId(TOP_RUNG)], rounds, roundOffset, job: String(job), timeoutMs });

for (const pool of [0, WIDE_POOL]) {
  const [program, ...args] = command("before");
  execFileSync(program!, [...args, "--case", caseId(TOP_RUNG), ...(pool > 0 ? ["--pool", String(pool)] : [])], { stdio: "inherit", timeout: timeoutMs });
}

writeFileSync(values.out, `${JSON.stringify({ job: String(job), env: benchEnv(), candidate: paired.pairs["after"], aa: paired.pairs["before~aa"], topAa: top.pairs["after~aa"] })}\n`);
