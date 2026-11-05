/**
 * One job of the speed gate of the store (roadmap CLI-94): `--job <n> --rounds <n> --cap <seconds> --out <file>`.
 * The job runs the read arm and the write arm in fresh processes, one at a time, and compares the source of
 * this tree with the whole source of the base commit, which the workflow writes to `base/`.
 *
 * The base source uses the dependencies of this tree. So a change of a dependency is outside this gate.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { benchEnv, freshRun } from "@mark1russell7/rigor-bench/fresh";

/** The read cases of the gate. A read is on one `Db` object, with no transaction. */
const READ_CASES = ["first-1", "none-1", "one-1"];

/** The write cases of the gate, on the default connection and in transactions. No id is also a read case, because one verdict holds all six. */
const WRITE_CASES = ["one-10", "many-1", "part-1"];

/**
 * The bursts of each write child. The time of a child is its median burst, so that a stall of the runner does not
 * block a change: on run 41977092527, with one burst of 1,000 writes, a child of the same source took 2.7 times the median.
 */
const WRITE_BURSTS = 15;

const { values } = parseArgs({ options: { job: { type: "string" }, rounds: { type: "string" }, cap: { type: "string" }, out: { type: "string" } } });
const job = Number(values.job);
const rounds = Number(values.rounds);
const cap = Number(values.cap);
if (!Number.isInteger(job) || !Number.isInteger(rounds) || !(cap > 0) || values.out === undefined) throw new RangeError("this job needs --job, --rounds, --cap and --out");
const out = values.out;
mkdirSync(dirname(out), { recursive: true });

const runOf = (suite: "read" | "write", cases: readonly string[], extra: readonly string[] = []) => {
  const arm = (id: string): { id: string; command: string[] } => ({ id, command: [process.execPath, "--import", "tsx", `bench/${suite}-arm.ts`, "--arm", id, "--job", String(job), "--counts", `${out}.${suite}.jsonl`, ...extra] });
  return freshRun({ base: arm("before"), candidates: [arm("after")], cases: [...cases], rounds, roundOffset: (job - 1) * rounds, job: String(job), timeoutMs: cap * 1000 });
};

const reads = await runOf("read", READ_CASES);
const writes = await runOf("write", WRITE_CASES, ["--bursts", String(WRITE_BURSTS)]);
const candidate = [...reads.pairs["after"]!, ...writes.pairs["after"]!];
const aa = [...reads.pairs["before~aa"]!, ...writes.pairs["before~aa"]!];
writeFileSync(out, `${JSON.stringify({ job: String(job), env: benchEnv(), candidate, aa })}\n`);
