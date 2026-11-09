/**
 * One job of the fan-out bench: `--job <n> --rounds <n> --out <file> [--measure all|total]`. Each arm of each case and
 * round starts in a fresh process. The job writes the records of the pair (plain, sliced) and of its
 * A/A pair, and the cases that it skipped. A child over `CHILD_LIMIT_MS` in the first round skips its case.
 *
 * The measure `total` times only the cases of the growth gate. The run of a pull request uses it. The default `all` also times `block`.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { benchEnv, freshRun } from "@mark1russell7/rigor-bench/fresh";
import { CHILD_LIMIT_MS, FAN_OUT_CASES, parseCase } from "./fan-out-cases.js";

const { values } = parseArgs({ options: { job: { type: "string" }, rounds: { type: "string" }, out: { type: "string" }, measure: { type: "string", default: "all" } } });
const job = Number(values.job);
const rounds = Number(values.rounds);
if (!Number.isInteger(job) || !Number.isInteger(rounds) || values.out === undefined) throw new RangeError("this job needs --job, --rounds and --out");
if (values.measure !== "all" && values.measure !== "total") throw new RangeError(`--measure is all or total, not ${values.measure}`);
const cases = values.measure === "all" ? FAN_OUT_CASES : FAN_OUT_CASES.filter((id) => parseCase(id).measure === "total");

const arm = (id: string): { id: string; command: string[] } => ({
  id,
  command: [process.execPath, "--import", "tsx", "bench/fan-out-arm.ts", "--arm", id],
});

const run = await freshRun({
  base: arm("plain"),
  candidates: [arm("sliced")],
  cases,
  rounds,
  roundOffset: (job - 1) * rounds,
  job: String(job),
  timeoutMs: CHILD_LIMIT_MS,
  overLimit: "skip",
});

mkdirSync(dirname(values.out), { recursive: true });
writeFileSync(values.out, `${JSON.stringify({ job: String(job), env: benchEnv(), candidate: run.pairs["sliced"], aa: run.pairs["plain~aa"], skipped: run.skipped })}\n`);
