/**
 * One job of the suite `read-bound` (roadmap CLI-91): `--job <n> --rounds <n> --cap <seconds> --out <file> [--base before|after]`.
 * The arm `--base` is the arm of each pair, `before` by default. With `after`, the arm `before` is a candidate
 * and starts one time for each case and round. At a high delay to MongoDB, the arm `before` takes most of the time of a job.
 * It compares limits of the change reads of one client at one time. So it reads the gain of a burst beside the cost to other callers.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { benchEnv, freshRun } from "@mark1russell7/rigor-bench/fresh";
import { READ_CASES, SHARE_SIZES } from "./read-cases.js";

const { values } = parseArgs({ options: { job: { type: "string" }, rounds: { type: "string" }, cap: { type: "string" }, out: { type: "string" }, base: { type: "string" } } });
const job = Number(values.job);
const rounds = Number(values.rounds);
const cap = Number(values.cap);
if (!Number.isInteger(job) || !Number.isInteger(rounds) || !(cap > 0) || values.out === undefined) throw new RangeError("this job needs --job, --rounds, --cap and --out");
const base = values.base ?? "before";
if (base !== "before" && base !== "after") throw new RangeError(`--base must be before or after, not ${base}`);
const other = base === "before" ? "after" : "before";

const SHARE = "semaphore(poolShare(db, CHANGE_READ_DIVISOR))";
const source = readFileSync(new URL("../src/storage/document-storage.ts", import.meta.url), "utf8");
if (source.split(SHARE).length !== 2) throw new RangeError(`the source does not have this text one time: ${SHARE}`);
for (const size of SHARE_SIZES) writeFileSync(new URL(`../src/storage/document-storage.share${String(size)}.ts`, import.meta.url), source.replace(SHARE, `semaphore(${String(size)})`));

const counts = `${values.out}.counts.jsonl`;
mkdirSync(dirname(values.out), { recursive: true });

const arm = (id: string): { id: string; command: string[] } => ({ id, command: [process.execPath, "--import", "tsx", "bench/read-arm.ts", "--arm", id, "--job", String(job), "--counts", counts] });
const shareArms = SHARE_SIZES.map((size) => `share${String(size)}`);

const run = await freshRun({
  base: arm(base),
  candidates: [arm(other), ...shareArms.map(arm)],
  cases: [...READ_CASES],
  rounds,
  roundOffset: (job - 1) * rounds,
  job: String(job),
  timeoutMs: cap * 1000,
});

writeFileSync(
  values.out,
  `${JSON.stringify({ job: String(job), env: benchEnv(), base, candidate: run.pairs[other], aa: run.pairs[`${base}~aa`], shares: Object.fromEntries(shareArms.map((id) => [id, run.pairs[id]])) })}\n`,
);
