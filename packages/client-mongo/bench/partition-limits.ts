/**
 * The gate row of the partition store (roadmap CLI-96): a limit of the p99 for each case and CPU model. The statistic of a
 * job is the median over its children of the p99 of the arm `partition`. The file `partition-limits.json` freezes each limit by
 * the rule `MODEL_LIMIT_RULE` of `rigor-bench`: the mean plus 3 standard deviations of 5 jobs or more on one CPU model.
 * A nightly reads only the candidates, and only a commit changes the file. A tighter limit is free, and a looser limit needs a reason.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  UNKNOWN_MODEL,
  checkModelLimits,
  modelLimitRead,
  type ModelLimitRead,
  type ModelLimitsFile,
  type ModelRead,
} from "@mark1russell7/rigor-bench";
import { median } from "@mark1russell7/rigor-statistics";
import type { TenantCount } from "./tenant-cases.js";

/** The cases of the gate row: the stated limit of a partition, 200 writes a second, with two and four processes. */
export const PARTITION_GATE_CASES: readonly string[] = ["200-p2", "200-p4"];

/** The rounds of each job of the gate row. A job with another count of children gives no read, because its statistic has another spread. */
export const PARTITION_GATE_ROUNDS = 3;

/** The measure of the file of limits. A change of this text needs a new `ruleReason` in the file. */
export const PARTITION_MEASURE = `the median over the ${PARTITION_GATE_ROUNDS} children of one job of the p99 ms of the arm partition`;

/** One job of the bench: the CPU model of its runner and the counts of its children. */
export interface PartitionJob {
  /** The name of the file of the job, for a fault. */
  readonly file: string;
  readonly cpu: string;
  readonly counts: readonly TenantCount[];
}

/** The reads of the jobs, and the jobs that give no read. */
export interface PartitionReads {
  readonly reads: readonly ModelRead[];
  /** The words of each job and case that gives no read. */
  readonly faults: readonly string[];
}

/** This function gives one read for each job and case: the median of the p99 of its children of the arm `partition`. */
export function partitionReads(jobs: readonly PartitionJob[], rounds = PARTITION_GATE_ROUNDS): PartitionReads {
  const reads: ModelRead[] = [];
  const faults: string[] = [];
  for (const job of jobs) {
    const own = job.counts.filter((row) => row.arm === "partition");
    const model = job.cpu.trim() === "" ? UNKNOWN_MODEL : job.cpu.trim();
    for (const name of [...new Set(own.map((row) => row.case))].sort()) {
      const children = own.filter((row) => row.case === name).map((row) => row.p99Ms);
      if (children.length !== rounds) {
        faults.push(`${job.file}: the case ${name} has ${children.length} children of the arm partition, not ${rounds}`);
        continue;
      }
      reads.push({ case: name, model, value: Number(median(children).toFixed(3)) });
    }
  }
  return { reads, faults };
}

/**
 * This function reads the jobs of the folders. A job is a file `<name>.json` with the field `env.cpu`, and its children
 * are in the file `<name>.json.counts.jsonl`. The other JSON files of a folder, for example a report, stay out.
 */
export function loadPartitionJobs(folders: readonly string[]): PartitionJob[] {
  return folders.flatMap((folder) => {
    const names = readdirSync(folder);
    return names
      .filter((name) => name.endsWith(".json") && names.includes(`${name}.counts.jsonl`))
      .sort()
      .map((name) => {
        const job = JSON.parse(readFileSync(join(folder, name), "utf8")) as { env?: { cpu?: string } };
        const counts = readFileSync(join(folder, `${name}.counts.jsonl`), "utf8")
          .split("\n")
          .filter((line) => line.trim() !== "")
          .map((line) => JSON.parse(line) as TenantCount);
        return { file: join(folder, name), cpu: job.env?.cpu ?? "", counts };
      });
  });
}

/** The outcome of the gate row. `no read` is not a pass. */
export type PartitionOutcome = "pass" | "block" | "no read";

/** The exit code of each outcome, as the speed gate of the store has them. */
export const PARTITION_EXIT: Readonly<Record<PartitionOutcome, 0 | 1 | 2>> = { pass: 0, block: 1, "no read": 2 };

/** The reading of one rung of the ladder of the report of the suite `tenant-partition`. */
export interface LadderRung {
  readonly case: string;
  /** The outcome of the rung: "provisional pass", "fail" or "no reading". */
  readonly outcome: string;
}

/** The read of one case of the gate row. */
export interface PartitionCase {
  readonly case: string;
  /** The outcome of the rung of the report, or "missing" when the report has no rung for this case. */
  readonly absolute: string;
  readonly reads: readonly ModelLimitRead[];
  readonly outcome: PartitionOutcome;
  readonly note: string;
}

/** The verdict of the gate row. */
export interface PartitionGate {
  readonly outcome: PartitionOutcome;
  readonly exitCode: 0 | 1 | 2;
  readonly cases: readonly PartitionCase[];
  /** The cases with no read. The gate starts one more job for each of these cases, one time. */
  readonly rerun: readonly string[];
  readonly text: string;
}

/**
 * This function gives the verdict of the gate row. Each case needs its absolute reading and the reads against the frozen limits.
 * - A rung that fails, or a read beyond the limit of its CPU model, blocks.
 * - A case with no read within a limit, or a rung with no reading, gives `no read`.
 * - A fault of the file of limits is an error, because a bad file cannot decide.
 */
export function partitionGate(limits: ModelLimitsFile, reads: readonly ModelRead[], ladder: readonly LadderRung[], cases = PARTITION_GATE_CASES): PartitionGate {
  const faults = checkModelLimits(limits);
  if (faults.length > 0) throw new RangeError(`partitionGate: the file of limits has faults: ${faults.join("; ")}`);
  const results = cases.map((name): PartitionCase => {
    const absolute = ladder.find((rung) => rung.case === name)?.outcome ?? "missing";
    const own = reads.filter((read) => read.case === name).map((read) => modelLimitRead(limits, read));
    const beyond = own.filter((read) => read.outcome === "beyond");
    const within = own.filter((read) => read.outcome === "within");
    if (absolute === "fail") return { case: name, absolute, reads: own, outcome: "block", note: `${name}: the rung fails its absolute reading` };
    if (beyond.length > 0) return { case: name, absolute, reads: own, outcome: "block", note: beyond.map((read) => read.note).join(" ") };
    if (absolute !== "provisional pass") return { case: name, absolute, reads: own, outcome: "no read", note: `${name}: the rung has no absolute reading (${absolute})` };
    if (within.length === 0) {
      const models = own.length === 0 ? "no job" : own.map((read) => read.model).join(", ");
      return { case: name, absolute, reads: own, outcome: "no read", note: `${name}: no read on a CPU model with a limit (${models})` };
    }
    return { case: name, absolute, reads: own, outcome: "pass", note: within.map((read) => read.note).join(" ") };
  });
  const outcome: PartitionOutcome = results.some((entry) => entry.outcome === "block")
    ? "block"
    : results.some((entry) => entry.outcome === "no read")
      ? "no read"
      : "pass";
  return {
    outcome,
    exitCode: PARTITION_EXIT[outcome],
    cases: results,
    rerun: results.filter((entry) => entry.outcome === "no read").map((entry) => entry.case),
    text: `The partition gate (CLI-96): ${outcome}. ${results.map((entry) => entry.note).join(" ")}`,
  };
}
