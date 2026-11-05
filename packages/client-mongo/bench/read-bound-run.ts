/**
 * One job of the suite `read-bound` (roadmap CLI-91): `--job <n> --rounds <n> --cap <seconds> --out <file>`.
 * It compares limits of the change reads of one client at one time. So it reads the gain of a burst beside the cost to other callers.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { benchEnv, freshRun } from "@mark1russell7/rigor-bench/fresh";
import { READ_CASES, SHARE_SIZES } from "./read-cases.js";

const { values } = parseArgs({ options: { job: { type: "string" }, rounds: { type: "string" }, cap: { type: "string" }, out: { type: "string" } } });
const job = Number(values.job);
const rounds = Number(values.rounds);
const cap = Number(values.cap);
if (!Number.isInteger(job) || !Number.isInteger(rounds) || !(cap > 0) || values.out === undefined) throw new RangeError("this job needs --job, --rounds, --cap and --out");

const SHARE = "new Semaphore(poolShare(db))";
const source = readFileSync(new URL("../src/storage/document-storage.ts", import.meta.url), "utf8");
if (source.split(SHARE).length !== 2) throw new RangeError(`the source does not have this text one time: ${SHARE}`);
for (const size of SHARE_SIZES) writeFileSync(new URL(`../src/storage/document-storage.share${String(size)}.ts`, import.meta.url), source.replace(SHARE, `new Semaphore(${String(size)})`));

const counts = `${values.out}.counts.jsonl`;
mkdirSync(dirname(values.out), { recursive: true });

const arm = (id: string): { id: string; command: string[] } => ({ id, command: [process.execPath, "--import", "tsx", "bench/read-arm.ts", "--arm", id, "--job", String(job), "--counts", counts] });
const shareArms = SHARE_SIZES.map((size) => `share${String(size)}`);

const run = await freshRun({
  base: arm("before"),
  candidates: [arm("after"), ...shareArms.map(arm)],
  cases: [...READ_CASES],
  rounds,
  roundOffset: (job - 1) * rounds,
  job: String(job),
  timeoutMs: cap * 1000,
});

writeFileSync(
  values.out,
  `${JSON.stringify({ job: String(job), env: benchEnv(), candidate: run.pairs["after"], aa: run.pairs["before~aa"], shares: Object.fromEntries(shareArms.map((id) => [id, run.pairs[id]])) })}\n`,
);
