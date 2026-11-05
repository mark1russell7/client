/**
 * The verdict of the speed gate of the store (roadmap CLI-94), as data. The claim of the gate is "the head is not slower
 * than the base by more than the limit". `notSlowerVerdict` of `rigor-bench` reads it with a sign test over the pairs of each
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
  /** The largest ratio of the head over the base that the claim permits. */
  readonly limit: number;
  /** The failed writes of the head. */
  readonly failures: number;
  /** The attempt of the CI run. A rerun is a further look that the level does not count, so the text states it. */
  readonly attempt: number;
}

/** The result of the gate, with the text that the job prints. */
export interface StoreGate {
  readonly outcome: GateOutcome;
  readonly exitCode: 0 | typeof BLOCK_EXIT | typeof NO_READ_EXIT;
  readonly text: string;
  readonly verdict: NotSlowerVerdict;
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

/** This function gives the verdict of the claim at a limit, with the looks of the gate. */
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
  const verdict = verdictAt(jobs, input.limit);
  const read = new Set(verdict.cases.map((entry) => entry.case));
  const absent = [...READ_CASES, ...WRITE_CASES].filter((name) => !read.has(name));
  const more = verdict.more.map((entry) => entry.case);
  const attempt = `Attempt ${input.attempt}.`;
  if (input.failures > 0) return { outcome: "block", exitCode: BLOCK_EXIT, text: `BLOCK: ${input.failures} writes of the head failed. ${attempt}`, verdict, more: [] };
  if (verdict.outcome === "block") return { outcome: "block", exitCode: BLOCK_EXIT, text: `BLOCK: ${verdict.reason} ${attempt}`, verdict, more: [] };
  if (absent.length > 0) return { outcome: "no read", exitCode: NO_READ_EXIT, text: `NO READ: the cases ${absent.join(", ")} have no records. This is not a block and not a pass. ${attempt}`, verdict, more: [] };
  if (verdict.outcome === "no read") return { outcome: "no read", exitCode: NO_READ_EXIT, text: `NO READ: ${verdict.reason} This is not a block and not a pass. ${attempt}`, verdict, more };
  return { outcome: "pass", exitCode: 0, text: `PASS: ${verdict.reason} ${attempt}`, verdict, more: [] };
}

/** This function gives the smallest limit that passes the jobs, to a thousandth of a log. A limit comes from the worst of this value over the runs of one source. */
export function passingLimit(jobs: readonly JobRecords[]): number {
  let low = 0;
  let high = Math.log(16);
  if (verdictAt(jobs, Math.exp(high)).outcome !== "pass") return Number.POSITIVE_INFINITY;
  while (high - low > 0.001) {
    const middle = (low + high) / 2;
    if (verdictAt(jobs, Math.exp(middle)).outcome === "pass") high = middle;
    else low = middle;
  }
  return Math.exp(high);
}
