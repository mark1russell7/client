/**
 * The verdict of the speed gate of the store (roadmap CLI-94), as data. The claim of the gate is "the head is not slower
 * than the base by more than the limit of the case". `notSlowerVerdict` of `rigor-bench` reads it with a sign test over the pairs of each
 * job, so a stall of the runner counts as one pair. Each of 2 jobs needs the bound, and a look of 24 rounds follows a case with no outcome.
 */

import { notSlowerVerdict, type GateOutcome, type JobRecords, type NotSlowerVerdict } from "@mark1russell7/rigor-bench";

/** The read cases of the gate. A read is on one `Db` object, with no transaction. */
export const READ_CASES: readonly string[] = ["first-1", "none-1", "one-1"];

/** The write cases of the gate, on the default connection and in transactions. */
export const WRITE_CASES: readonly string[] = ["one-10", "many-1", "part-1"];

/** The looks of the gate, in rounds of each job. The level of the family has an equal share at each look. The second look is the budget of a job. */
export const STORE_LOOKS: readonly number[] = [12, 24];

/** The exit code of a gate that reads "no read". It differs from a block, so nobody reads a loud run as a slower head. */
export const NO_READ_EXIT = 2;

/** The exit code of a gate that reads "block". */
export const BLOCK_EXIT = 1;

/** The inputs of `storeGate` other than the records. */
export interface StoreGateInput {
  /** The largest ratio of the head over the base that the claim permits, for each case. */
  readonly limits: Readonly<Record<string, number>>;
  /** The cases that the gate reads and prints, and that have no part in its outcome or its level. */
  readonly reportOnly: readonly string[];
  /** The failed writes of the head. */
  readonly failures: number;
  /** The try number of the CI run. A rerun is a further look that the level does not count, so the text states it. */
  readonly attempt: number;
}

/** The result of the gate, with the text that the job prints. */
export interface StoreGate {
  readonly outcome: GateOutcome;
  readonly exitCode: 0 | typeof BLOCK_EXIT | typeof NO_READ_EXIT;
  readonly text: string;
  readonly verdict: NotSlowerVerdict;
  /** The read of each report-only case, alone. It has no effect on the outcome. */
  readonly reported: NotSlowerVerdict["cases"];
  /** The cases that take the next look. The list is empty when the verdict is final. */
  readonly more: readonly string[];
}

/** This function joins the files of the jobs by the label of the job, because a job with a second look has two files. */
export function joinJobs(files: readonly JobRecords[]): JobRecords[] {
  const out = new Map<string, { candidate: JobRecords["candidate"]; aa: JobRecords["aa"] }>();
  for (const file of files) {
    const known = out.get(file.job);
    out.set(file.job, { candidate: [...(known?.candidate ?? []), ...file.candidate], aa: [...(known?.aa ?? []), ...file.aa] });
  }
  return [...out].map(([job, records]) => ({ job, ...records }));
}

/** The file of the limits of the gate. */
export interface GateLimit {
  readonly limits: Readonly<Record<string, number>>;
  /** The slowdown that the gate must catch on each case, stated before the runs. */
  readonly slowdowns: Readonly<Record<string, number>>;
  readonly reportOnly: readonly string[];
  readonly formula: string;
  readonly runs: readonly string[];
}

/** This function gives the margin of a case. A case with no limit stops the read, because no limit is not a pass. */
function marginOf(limits: Readonly<Record<string, number>>): (name: string) => number {
  return (name) => {
    const limit = limits[name];
    if (limit === undefined) throw new RangeError(`the case ${name} has no limit`);
    return Math.log(limit);
  };
}

/** This function gives the records of the jobs for the named cases. */
function ofCases(jobs: readonly JobRecords[], names: readonly string[]): JobRecords[] {
  return jobs.map((job) => ({ job: job.job, candidate: job.candidate.filter((row) => names.includes(row.case)), aa: job.aa.filter((row) => names.includes(row.case)) }));
}

/** This function gives the gate cases with a limit at or over the stated slowdown, or with no stated slowdown. The gate does not hold these cases. */
export function overStated(gate: Pick<GateLimit, "limits" | "slowdowns" | "reportOnly">): string[] {
  return [...READ_CASES, ...WRITE_CASES].filter((name) => {
    if (gate.reportOnly.includes(name)) return false;
    const limit = gate.limits[name];
    const slowdown = gate.slowdowns[name];
    return limit === undefined || slowdown === undefined || limit >= slowdown;
  });
}

/** This function gives the verdict of the claim at one limit for all cases, with the looks of the gate. */
function verdictAt(jobs: readonly JobRecords[], limit: number): NotSlowerVerdict {
  return notSlowerVerdict(jobs, { margin: Math.log(limit), looks: STORE_LOOKS });
}

/**
 * This function gives the gate of the jobs.
 * - The result is "block" when a case reads "slower" or when a write of the head fails.
 * - The result is "no read" when a case has no outcome, or when a case of the gate has no records. It is not a pass.
 * - The result is "pass" when each case of the gate reads "not slower".
 */
export function storeGate(jobs: readonly JobRecords[], input: StoreGateInput): StoreGate {
  const gated = [...READ_CASES, ...WRITE_CASES].filter((name) => !input.reportOnly.includes(name));
  const verdict = notSlowerVerdict(ofCases(jobs, gated), { margin: marginOf(input.limits), looks: STORE_LOOKS });
  const reported = input.reportOnly.length === 0 ? [] : notSlowerVerdict(ofCases(jobs, input.reportOnly), { margin: marginOf(input.limits), looks: STORE_LOOKS }).cases;
  const read = new Set(verdict.cases.map((entry) => entry.case));
  const absent = gated.filter((name) => !read.has(name));
  const more = verdict.more.map((entry) => entry.case);
  const attempt = `Attempt ${input.attempt}.`;
  if (input.failures > 0) return { outcome: "block", exitCode: BLOCK_EXIT, text: `BLOCK: ${input.failures} writes of the head failed. ${attempt}`, verdict, reported, more: [] };
  if (verdict.outcome === "block") return { outcome: "block", exitCode: BLOCK_EXIT, text: `BLOCK: ${verdict.reason} ${attempt}`, verdict, reported, more: [] };
  if (absent.length > 0) return { outcome: "no read", exitCode: NO_READ_EXIT, text: `NO READ: the cases ${absent.join(", ")} have no records. This is not a block and not a pass. ${attempt}`, verdict, reported, more: [] };
  if (verdict.outcome === "no read") return { outcome: "no read", exitCode: NO_READ_EXIT, text: `NO READ: ${verdict.reason} This is not a block and not a pass. ${attempt}`, verdict, reported, more };
  return { outcome: "pass", exitCode: 0, text: `PASS: ${verdict.reason} ${attempt}`, verdict, reported, more: [] };
}

/**
 * This function gives the jobs and cases that do not reach the last look. Records that stop before the last look cannot show what that look reads.
 * So `passingLimit` over these records gives an upper bound, and not a limit for the gate.
 */
export function shortOfLastLook(jobs: readonly JobRecords[]): string[] {
  const last = STORE_LOOKS[STORE_LOOKS.length - 1] ?? 0;
  return jobs.flatMap((job) => {
    const pairs = new Map<string, number>();
    for (const row of job.candidate) pairs.set(row.case, (pairs.get(row.case) ?? 0) + 1);
    return [...READ_CASES, ...WRITE_CASES].filter((name) => (pairs.get(name) ?? 0) < last).map((name) => `job ${job.job}, ${name}: ${pairs.get(name) ?? 0} of ${last} rounds`);
  });
}

/** One try of the gate on a pull request, from its report. */
export interface GateAttempt {
  readonly pr: string;
  readonly run: string;
  readonly attempt: number;
  readonly outcome: GateOutcome;
}

/** The count of the reruns of one pull request. A pass after a no read is a pass that a rerun can buy, so the count keeps it apart. */
export interface RerunCount {
  readonly pr: string;
  readonly noReads: number;
  readonly rerunsAfterNoRead: number;
  readonly passesAfterNoRead: number;
}

/** This function counts the no reads and the reruns that follow them, for each pull request. A rerun is a further look that the level does not count. */
export function rerunCounts(attempts: readonly GateAttempt[]): RerunCount[] {
  const byPr = new Map<string, GateAttempt[]>();
  for (const row of attempts) byPr.set(row.pr, [...(byPr.get(row.pr) ?? []), row]);
  return [...byPr].map(([pr, rows]) => {
    const later = rows.filter((row) => rows.some((other) => other.run === row.run && other.attempt === row.attempt - 1 && other.outcome === "no read"));
    return {
      pr,
      noReads: rows.filter((row) => row.outcome === "no read").length,
      rerunsAfterNoRead: later.length,
      passesAfterNoRead: later.filter((row) => row.outcome === "pass").length,
    };
  });
}

/**
 * This function gives the smallest limit that passes one case alone, for each case of the gate. A case alone has the level of the whole family.
 * So a limit from these values needs a read of all cases together, with the correction over all cases.
 */
export function caseLimits(jobs: readonly JobRecords[]): Record<string, number> {
  return Object.fromEntries([...READ_CASES, ...WRITE_CASES].map((name) => [name, searchLeast((limit) => notSlowerVerdict(ofCases(jobs, [name]), { margin: Math.log(limit), looks: STORE_LOOKS }).outcome === "pass")]));
}

/** This function gives the outcome of all cases together, with a limit for each case. */
export function outcomeAtCaseLimits(jobs: readonly JobRecords[], limits: Readonly<Record<string, number>>): GateOutcome {
  return notSlowerVerdict(jobs, { margin: marginOf(limits), looks: STORE_LOOKS }).outcome;
}

/**
 * This function gives the smallest slowdown of one case that blocks at the limits, with all cases in the read. It multiplies the head times of the case in same-source records.
 * This reading is arithmetic: it assumes that a fault multiplies each time of the case by one factor. Only a flip proves a slowdown.
 */
export function heldSlowdown(jobs: readonly JobRecords[], name: string, limits: Readonly<Record<string, number>>): number {
  const slowed = (factor: number): JobRecords[] => jobs.map((job) => ({ ...job, candidate: job.candidate.map((row) => (row.case === name ? { ...row, b: row.b * factor } : row)) }));
  return searchLeast((factor) => notSlowerVerdict(slowed(factor), { margin: marginOf(limits), looks: STORE_LOOKS }).blocks.includes(name));
}

/** This function gives the smallest limit that passes the jobs, to a thousandth of a log. A limit comes from the worst of this value over the runs of one source, each with records of the last look. */
export function passingLimit(jobs: readonly JobRecords[]): number {
  return searchLeast((limit) => verdictAt(jobs, limit).outcome === "pass");
}

/** This function gives the smallest ratio that `holds` accepts, to a thousandth of a log, or infinity when no ratio up to 16 holds. */
function searchLeast(holds: (ratio: number) => boolean): number {
  let low = 0;
  let high = Math.log(16);
  if (!holds(Math.exp(high))) return Number.POSITIVE_INFINITY;
  while (high - low > 0.001) {
    const middle = (low + high) / 2;
    if (holds(Math.exp(middle))) high = middle;
    else low = middle;
  }
  return Math.exp(high);
}
