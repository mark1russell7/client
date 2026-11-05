/**
 * One job of the tenant load bench, for a list of cases: `--job <n> --rounds <n> --cap <seconds> --out <file>`. Each
 * arm of each case and round runs in a fresh process, one at a time, because the load and the counters of the server
 * are global. The time of a child is its p99, so the pairs give the ratio of the one collection to the control, with an A/A.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { benchEnv, freshRun } from "@mark1russell7/rigor-bench/fresh";

/** This function runs one job over these cases. */
export async function runTenantJob(cases: readonly string[]): Promise<void> {
  const { values } = parseArgs({ options: { job: { type: "string" }, rounds: { type: "string" }, cap: { type: "string" }, out: { type: "string" } } });
  const job = Number(values.job);
  const rounds = Number(values.rounds);
  const cap = Number(values.cap);
  if (!Number.isInteger(job) || !Number.isInteger(rounds) || !(cap > 0) || values.out === undefined) throw new RangeError("this job needs --job, --rounds, --cap and --out");

  const counts = `${values.out}.counts.jsonl`;
  mkdirSync(dirname(values.out), { recursive: true });

  const arm = (id: string): { id: string; command: string[] } => ({
    id,
    command: [process.execPath, "--import", "tsx", "bench/tenant-arm.ts", "--arm", id, "--job", String(job), "--counts", counts],
  });

  const run = await freshRun({
    base: arm("control"),
    candidates: [arm("store")],
    cases: [...cases],
    rounds,
    roundOffset: (job - 1) * rounds,
    job: String(job),
    timeoutMs: cap * 1000,
  });

  writeFileSync(values.out, `${JSON.stringify({ job: String(job), env: benchEnv(), candidate: run.pairs["store"], aa: run.pairs["control~aa"] })}\n`);
}
