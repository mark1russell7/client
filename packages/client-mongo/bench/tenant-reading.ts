/**
 * The rule of the tenant load bench. A test reaches this rule, and the report uses it.
 */

import { ABORT_LIMIT, KEEP_UP_P99_MS, KEEP_UP_SHARE, WINDOW_MS, type TenantCount } from "./tenant-cases.js";

/** The rule in words, for the report. */
export const READING_RULE = `A provisional pass has no failure, a reply to each write, at least ${KEEP_UP_SHARE} of the plan of the child and a p99 of at most ${KEEP_UP_P99_MS} ms. The rate is a first guess, and this limit is a first reading. One arrival is one write of one document, so an action of an app with more writes takes the rate of its writes.`;

/** The change of the rule, beside the figures that it reads. */
export const READING_RULE_CHANGE = "The first form of the rule compared a child with the rate of the case. A Poisson plan of 400 writes has a spread of 5 %, so that form failed children that kept up, in the control too. The rule now compares a child with its own plan.";

/** The fields of a child that the rule reads. */
export type ReadingRow = Pick<TenantCount, "driverHeld" | "failures" | "unfinished" | "unsent" | "writesPerSecond" | "planned" | "p99Ms">;

/** This function gives the reading of the children of one arm of one case. */
export function readingOf(rows: readonly ReadingRow[]): { outcome: string; reasons: string[] } {
  if (rows.some((row) => !row.driverHeld)) return { outcome: "no reading", reasons: ["a driver did not keep its schedule"] };
  const reasons: string[] = [];
  if (rows.some((row) => row.failures > 0)) reasons.push("a write failed");
  if (rows.some((row) => row.unfinished + row.unsent > 0)) reasons.push("a write had no reply in the grace");
  if (rows.some((row) => row.writesPerSecond * (WINDOW_MS / 1000) < KEEP_UP_SHARE * row.planned)) reasons.push(`a child ended under ${KEEP_UP_SHARE} of its plan in the load`);
  if (rows.some((row) => row.p99Ms > KEEP_UP_P99_MS)) reasons.push(`a child had a p99 over ${KEEP_UP_P99_MS} ms`);
  return { outcome: reasons.length === 0 ? "provisional pass" : "fail", reasons };
}

/** The abort rule in words, for the report (roadmap CLI-96). */
export const ABORT_RULE = `With two processes or more, at most ${ABORT_LIMIT} of the transactions of each child abort. The server counts the transactions of the whole load, and a retry of the driver after an abort is one more start.`;

/** The fields of a child that the abort rule reads. */
export type AbortRow = Pick<TenantCount, "transactionsStarted" | "transactionsAborted">;

/** This function gives the share of the transactions of a child that aborted. A child with no transaction aborts none. */
export const abortShareOf = (row: AbortRow): number => (row.transactionsStarted === 0 ? 0 : row.transactionsAborted / row.transactionsStarted);

/** The fields of a child that the commits of each finished write read. */
export type CommitRow = Pick<TenantCount, "planned" | "unfinished" | "transactionsCommitted">;

/**
 * This function gives the commits of the server for each finished write of a child (roadmap CLI-96). A set on a replica
 * set is one commit, so a value over 1 is extra work. The value is null for a record with no commits or no finished write.
 */
export function commitsPerWriteOf(row: CommitRow): number | null {
  const finished = row.planned - row.unfinished;
  if (row.transactionsCommitted === undefined || finished <= 0) return null;
  return Number((row.transactionsCommitted / finished).toFixed(3));
}

/** This function gives the abort rule of the children of one arm of one case, or null for a case of one process. */
export function abortReadingOf(rows: readonly AbortRow[], processes: number): { limit: number; worst: number; holds: boolean } | null {
  if (processes < 2 || rows.length === 0) return null;
  const worst = Math.max(...rows.map(abortShareOf));
  return { limit: ABORT_LIMIT, worst: Number(worst.toFixed(4)), holds: worst <= ABORT_LIMIT };
}

/** The share of the processors of the runner, with work or a wait for the disk, at which the runner is full. This value is a first guess. */
export const RUNNER_FULL = 0.9;

/** The limit rule in words, for the report (roadmap CLI-96). */
export const LIMIT_RULE = `A rung that does not pass names its limit. The limit is the runner when a driver lost its schedule, when the processors of the runner have work or wait for the disk for ${RUNNER_FULL} of the load, or when one writer used ${RUNNER_FULL} of its processor. The limit is the design when the abort rule fails, or when the rung fails with free processors. A rung with the runner as its only limit gives no reading of the design. The value ${RUNNER_FULL} is a first guess.`;

/** The fields of a child that the processor measures read. */
export type CpuRow = Pick<TenantCount, "cores" | "writerBusy" | "writesPerSecond">;

/** The processor time of one child. Each value is null when the child has no reading of it. */
export interface CpuReading {
  /** The milliseconds of processor time of all writers of the child for each write. */
  readonly writerMsPerWrite: number | null;
  /** The milliseconds of processor time of the whole runner, MongoDB and the writers, for each write. */
  readonly runnerMsPerWrite: number | null;
  /** The mean share of the processors of the runner with work or a wait for the disk. */
  readonly runnerFull: number | null;
  /** The share of one processor that the busiest writer of the child used. */
  readonly writerWorst: number | null;
}

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);
const rounded = (value: number | null, digits = 3): number | null => (value === null ? null : Number(value.toFixed(digits)));

/** This function gives the processor time of one child. A share of one processor over the load is that many seconds of time for each second. */
export function cpuOf(row: CpuRow): CpuReading {
  const writes = row.writesPerSecond;
  const writer = row.writerBusy && row.writerBusy.length > 0 ? row.writerBusy : null;
  const cores = row.cores && row.cores.length > 0 ? row.cores : null;
  return {
    writerMsPerWrite: rounded(writer && writes > 0 ? (sum(writer) * 1000) / writes : null),
    runnerMsPerWrite: rounded(cores && writes > 0 ? (sum(cores.map((core) => core.busy)) * 1000) / writes : null),
    runnerFull: rounded(cores ? sum(cores.map((core) => core.busy + core.iowait)) / cores.length : null),
    writerWorst: rounded(writer ? Math.max(...writer) : null),
  };
}

/** The facts of one rung that the limit rule reads. Each processor share is the worst over the children. */
export interface LimitFacts {
  readonly outcome: string;
  readonly abortsHold: boolean | null;
  readonly runnerFull: number | null;
  readonly writerWorst: number | null;
}

/** The limit of a rung that does not pass, with its reasons. The limit is null for a pass. */
export interface LimitReading {
  readonly limit: "runner" | "design" | "runner and design" | "unknown" | null;
  readonly reasons: string[];
}

/** This function gives the limit of one rung by the limit rule. */
export function limitOf(facts: LimitFacts): LimitReading {
  const passes = facts.outcome === "provisional pass";
  if (passes && facts.abortsHold !== false) return { limit: null, reasons: [] };
  const runner: string[] = [];
  if (facts.outcome === "no reading") runner.push("a driver did not keep its schedule");
  if (facts.runnerFull !== null && facts.runnerFull >= RUNNER_FULL) runner.push(`the processors of the runner had work or waited for the disk for ${facts.runnerFull} of the load`);
  if (facts.writerWorst !== null && facts.writerWorst >= RUNNER_FULL) runner.push(`a writer used ${facts.writerWorst} of its processor`);
  const design: string[] = [];
  if (facts.abortsHold === false) design.push("the abort rule failed");
  if (facts.outcome === "fail" && runner.length === 0 && facts.runnerFull !== null) design.push(`the rung failed with free processors, at ${facts.runnerFull} of the runner`);
  if (runner.length > 0 && design.length > 0) return { limit: "runner and design", reasons: [...runner, ...design] };
  if (runner.length > 0) return { limit: "runner", reasons: runner };
  if (design.length > 0) return { limit: "design", reasons: design };
  return { limit: "unknown", reasons: ["the runner gave no processor times"] };
}
