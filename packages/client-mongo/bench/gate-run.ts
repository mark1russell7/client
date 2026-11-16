/**
 * One job of the speed gate of the store (roadmap CLI-94): `--job <n> --rounds <n> --cap <seconds> --out <file> [--from <n>] [--cases <a,b>] [--writes paired|fresh]`.
 * A second look of the gate gives `--from` and the cases with no outcome. The job compares the source of this tree
 * with the whole source of the base commit, which the workflow writes to `base/`. Each child is a fresh process, and one child starts at a time.
 *
 * The base source uses the dependencies of this tree. So a change of a dependency is outside this gate.
 *
 * With `--writes paired`, the default, one child sends the bursts of both arms of a write case in turn (roadmap CLI-114).
 * With `--writes fresh`, each arm of a write case has its own child, as the read cases have.
 */

import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import type { ChildRecords, PairedTime } from "@mark1russell7/rigor-bench";
import { benchEnv, freshRun } from "@mark1russell7/rigor-bench/fresh";
import { READ_CASES, WRITE_CASES } from "./gate-verdict.js";

/**
 * The bursts of each fresh write child. The time of a child is its median burst, so a stall of the runner does not
 * block a change. On run 41977092527, with one burst of 1,000 writes, a child of the same source took 2.7 times the median.
 */
const WRITE_BURSTS = 15;

/**
 * The bursts of each source of a pair in a paired child. A child sends 3 warm bursts and 32 counted bursts. A job
 * thus sends 0.78 times the bursts of the fresh arms, which start 3 children of 15 bursts for each case and round.
 */
const PAIRED_BURSTS = 8;

/** The time limit of a paired child, as a multiple of `--cap`: a paired child sends 35 bursts, and a fresh child 15. */
const PAIRED_CAP_FACTOR = 3;

const { values } = parseArgs({ options: { job: { type: "string" }, rounds: { type: "string" }, cap: { type: "string" }, out: { type: "string" }, from: { type: "string" }, cases: { type: "string" }, writes: { type: "string" } } });
const job = Number(values.job);
const rounds = Number(values.rounds);
const cap = Number(values.cap);
const from = Number(values.from ?? 0);
const named = values.cases?.split(",");
const chosen = (cases: readonly string[]): string[] => cases.filter((name) => named === undefined || named.includes(name));
if (!Number.isInteger(job) || !Number.isInteger(rounds) || !(cap > 0) || !Number.isInteger(from) || values.out === undefined) throw new RangeError("this job needs --job, --rounds, --cap and --out");
const writeMode = values.writes ?? "paired";
if (writeMode !== "paired" && writeMode !== "fresh") throw new RangeError(`--writes needs paired or fresh, not ${writeMode}`);
const out = values.out;
mkdirSync(dirname(out), { recursive: true });

const runOf = (suite: "read" | "write", cases: readonly string[], extra: readonly string[] = []) => {
  const arm = (id: string): { id: string; command: string[] } => ({ id, command: [process.execPath, "--import", "tsx", `bench/${suite}-arm.ts`, "--arm", id, "--job", String(job), "--counts", `${out}.${suite}.jsonl`, ...extra] });
  return freshRun({ base: arm("before"), candidates: [arm("after")], cases: [...cases], rounds, roundOffset: (job - 1) * rounds + from, job: String(job), timeoutMs: cap * 1000 });
};

/**
 * This function starts each write case in paired children: one fresh child for each case and round. The A/A pair of a
 * child compares the base with a second copy of the base, which this function writes to `base-aa/` one time.
 */
const pairedWrites = (cases: readonly string[]): { candidate: PairedTime[]; aa: PairedTime[] } => {
  cpSync("base/src", "base-aa/src", { recursive: true });
  const candidate: PairedTime[] = [];
  const aa: PairedTime[] = [];
  for (let r = 0; r < rounds; r++) {
    const round = (job - 1) * rounds + from + r;
    for (const name of cases) {
      const index = (WRITE_CASES as readonly string[]).indexOf(name);
      const args = ["--import", "tsx", "bench/write-paired-arm.ts", "--case", name, "--job", String(job), "--round", String(round), "--index", String(index), "--counts", `${out}.write.jsonl`, "--bursts", String(PAIRED_BURSTS)];
      const child = spawnSync(process.execPath, args, { encoding: "utf8", timeout: cap * 1000 * PAIRED_CAP_FACTOR, stdio: ["ignore", "pipe", "inherit"], maxBuffer: 16 * 1024 * 1024 });
      const last = child.stdout.trim().split("\n").at(-1);
      if (child.status !== 0 || last === undefined || last === "") throw new Error(`the paired child of ${name} in round ${round} ended with ${child.status ?? child.signal}`);
      const records = JSON.parse(last) as ChildRecords;
      candidate.push(records.candidate);
      aa.push(records.aa);
    }
  }
  return { candidate, aa };
};

const readCases = chosen(READ_CASES);
const writeCases = chosen(WRITE_CASES);
const reads = readCases.length === 0 ? undefined : await runOf("read", readCases);
const fresh = writeMode === "fresh" && writeCases.length > 0 ? await runOf("write", writeCases, ["--bursts", String(WRITE_BURSTS)]) : undefined;
const paired = writeMode === "paired" && writeCases.length > 0 ? pairedWrites(writeCases) : undefined;
const candidate = [...(reads?.pairs["after"] ?? []), ...(fresh?.pairs["after"] ?? []), ...(paired?.candidate ?? [])];
const aa = [...(reads?.pairs["before~aa"] ?? []), ...(fresh?.pairs["before~aa"] ?? []), ...(paired?.aa ?? [])];
writeFileSync(out, `${JSON.stringify({ job: String(job), env: benchEnv(), candidate, aa })}\n`);
