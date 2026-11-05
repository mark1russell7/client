/**
 * One job of the flip of the speed gate of the store (roadmap CLI-94). It adds the arm `flip`, the source of this tree with the stated slowdown of each case, beside the arm `after`, the no-fault copy: `--job <n> --rounds <n> --cap <seconds> --out <file> [--from <n>] [--cases <a,b>]`.
 * A second look of the gate gives `--from` and the cases with no outcome. The job runs the read arm and the write arm in fresh processes, one at a time, and compares the source of
 * this tree with the whole source of the base commit, which the workflow writes to `base/`.
 *
 * The base source uses the dependencies of this tree. So a change of a dependency is outside this gate.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { benchEnv, freshRun } from "@mark1russell7/rigor-bench/fresh";
import { READ_CASES, WRITE_CASES } from "./gate-verdict.js";

/**
 * The bursts of each write child. The time of a child is its median burst, so that a stall of the runner does not
 * block a change: on run 41977092527, with one burst of 1,000 writes, a child of the same source took 2.7 times the median.
 */
const WRITE_BURSTS = 15;

const { values } = parseArgs({ options: { job: { type: "string" }, rounds: { type: "string" }, cap: { type: "string" }, out: { type: "string" }, from: { type: "string" }, cases: { type: "string" } } });
const job = Number(values.job);
const rounds = Number(values.rounds);
const cap = Number(values.cap);
const from = Number(values.from ?? 0);
const named = values.cases?.split(",");
const chosen = (cases: readonly string[]): string[] => cases.filter((name) => named === undefined || named.includes(name));
if (!Number.isInteger(job) || !Number.isInteger(rounds) || !(cap > 0) || !Number.isInteger(from) || values.out === undefined) throw new RangeError("this job needs --job, --rounds, --cap and --out");
const out = values.out;
mkdirSync(dirname(out), { recursive: true });

const runOf = (suite: "read" | "write", cases: readonly string[], extra: readonly string[] = []) => {
  const arm = (id: string): { id: string; command: string[] } => ({ id, command: [process.execPath, "--import", "tsx", `bench/${suite}-arm.ts`, "--arm", id, "--job", String(job), "--counts", `${out}.${suite}.jsonl`, ...extra] });
  return freshRun({ base: arm("before"), candidates: [arm("after"), arm("flip")], cases: [...cases], rounds, roundOffset: (job - 1) * rounds + from, job: String(job), timeoutMs: cap * 1000 });
};

const readCases = chosen(READ_CASES);
const writeCases = chosen(WRITE_CASES);
const reads = readCases.length === 0 ? undefined : await runOf("read", readCases);
const writes = writeCases.length === 0 ? undefined : await runOf("write", writeCases, ["--bursts", String(WRITE_BURSTS)]);
const candidate = [...(reads?.pairs["after"] ?? []), ...(writes?.pairs["after"] ?? [])];
const aa = [...(reads?.pairs["before~aa"] ?? []), ...(writes?.pairs["before~aa"] ?? [])];
const flip = [...(reads?.pairs["flip"] ?? []), ...(writes?.pairs["flip"] ?? [])];
writeFileSync(out, `${JSON.stringify({ job: String(job), env: benchEnv(), candidate, flip, aa })}\n`);
