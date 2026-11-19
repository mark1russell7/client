/**
 * The block budget of the fan-out bench (roadmap CLI-90). The budget is the longest block of the event loop in one
 * publish of the arm `sliced`, for each size. The gate reads the median of a run, because the worst
 * child of a run changes by a third from run to run. The run of a pull request times only the case `total`, so only
 * the scheduled runs of `main` and the dispatches read the budget.
 *
 * The block grows linearly with the subscribers: approximately 9 ms at 10,000 and 92 ms at 100,000. A slice of 256
 * handlers takes approximately 1.6 ms, and the longest GC event is approximately a third of the block at 100,000. Thus
 * the cause of the growth is not known. The budget holds the block of the code of today, and a change that makes it longer blocks.
 */

import { cpuEntry, runLimit } from "@mark1russell7/rigor-bench";
import { median } from "@mark1russell7/rigor-statistics";
import { parseCase } from "./fan-out-cases.js";
import { type GrowthJob, MIN_JOBS } from "./fan-out-growth.js";

/**
 * The scheduled runs of the budget. Each run has 5 jobs of 6 rounds on the bus code of db1bcaaf2. The scheduled run
 * 42443307703 is older than that code, so it is not in the list. The last 3 runs have the GC probe, which adds approximately 1.5 ms at 100,000.
 */
export const BUDGET_RUNS = ["42750370538", "43149179338", "43359868280", "44011175830", "44231384878", "44452405113"] as const;

/** The median of the sliced block of each run of `BUDGET_RUNS` over its 30 children, in milliseconds, in the order of the runs. */
export const BLOCK_MEDIANS: Readonly<Record<number, readonly number[]>> = {
  1_000: [3.575, 3.504, 3.083, 3.94, 3.825, 3.73],
  10_000: [8.863, 8.972, 8.448, 9.617, 8.916, 8.89],
  100_000: [91.022, 91.368, 90.299, 92.597, 93.19, 92.418],
};

/**
 * The budget of each size in milliseconds: the worst median of the runs plus their spread, rounded up to
 * a whole number (`runLimit`). At 100,000 subscribers: 93.19 + (93.19 - 90.299) = 96.081, so 97.
 */
export const BLOCK_BUDGET: Readonly<Record<number, number>> = Object.fromEntries(
  Object.entries(BLOCK_MEDIANS).map(([size, medians]) => [Number(size), runLimit(medians, { digits: 0 }).limit]),
);

/**
 * The CPU models of the jobs of `BUDGET_RUNS`. The budget is a time, so a slower model can go past it with the same code.
 * A key is a part of the CPU name, as `cpuEntry` reads it.
 */
export const BUDGET_MODELS = ["EPYC 7763", "EPYC 9V45", "EPYC 9V74", "8573C", "6975P-C"] as const;

/** The fewest children of a size in a read. Each run of `BUDGET_RUNS` has 30 children at each size: 5 jobs of 6 rounds. */
export const MIN_CHILDREN = 30;

/** The read of one size against its budget. */
export interface BudgetSize {
  readonly case: string;
  readonly limit: number;
  readonly children: number;
  /** The median of the sliced block over the children, or undefined when the size has no read. */
  readonly median: number | undefined;
  readonly outcome: "within" | "beyond" | "no read";
}

/** The outcome of the budget. `no read` is not a pass. `not timed` tells that the jobs time no case `block`, as in the run of a pull request. */
export type BudgetOutcome = "pass" | "block" | "no read" | "not timed";

/** The read of the budget over the jobs of one run. */
export interface BlockBudget {
  readonly outcome: BudgetOutcome;
  /** The text that tells why the budget does not pass, or undefined for a pass. */
  readonly reason: string | undefined;
  readonly sizes: readonly BudgetSize[];
  /** The CPU name of each job outside `BUDGET_MODELS`, sorted. A job with no CPU name gives `unknown`. */
  readonly uncovered: readonly string[];
}

const COVERED: Readonly<Record<string, boolean>> & { readonly other: boolean } = {
  ...Object.fromEntries(BUDGET_MODELS.map((model) => [model, true])),
  other: false,
};

/** This function reads the sliced block of each size of the budget in the jobs of one run. */
export function blockBudget(jobs: readonly GrowthJob[]): BlockBudget {
  const records = jobs.flatMap(({ job, candidate }) => candidate.filter((record) => parseCase(record.case).measure === "block").map((record) => ({ job, record })));
  const skips = jobs.flatMap(({ job, skipped }) => (skipped ?? []).filter((skip) => parseCase(skip.case).measure === "block").map((skip) => ({ job, ...skip })));
  const uncovered = [...new Set(jobs.flatMap(({ env }) => (env === undefined ? ["unknown"] : cpuEntry(COVERED, env.cpu).value ? [] : [env.cpu])))].sort();
  if (records.length === 0 && skips.length === 0) return { outcome: "not timed", reason: "the jobs time no case block", sizes: [], uncovered };
  const count = new Set(records.map(({ job }) => job)).size;
  const sizes = Object.entries(BLOCK_BUDGET).map(([size, limit]): BudgetSize => {
    const id = `block-${size}`;
    const values = records.filter(({ record }) => record.case === id).map(({ record }) => record.b);
    const skipped = skips.some((skip) => skip.case === id);
    if (skipped || count < MIN_JOBS || values.length < MIN_CHILDREN) return { case: id, limit, children: values.length, median: undefined, outcome: "no read" };
    const value = median(values);
    return { case: id, limit, children: values.length, median: value, outcome: value <= limit ? "within" : "beyond" };
  });
  const list = (outcome: BudgetSize["outcome"]): string =>
    sizes
      .filter((size) => size.outcome === outcome)
      .map((size) => `${size.case}: ${size.median?.toFixed(1)} ms, budget ${size.limit} ms`)
      .join("; ");
  const late = skips.map((skip) => `${skip.case} (arm ${skip.arm}, job ${skip.job}): ${skip.reason}`);
  if (late.length > 0) return { outcome: "no read", reason: `the jobs skipped a case of the budget: ${late.join("; ")}`, sizes, uncovered };
  if (count < MIN_JOBS) return { outcome: "no read", reason: `the budget needs ${MIN_JOBS} jobs or more, and the run has ${count}`, sizes, uncovered };
  const few = sizes.filter((size) => size.outcome === "no read").map((size) => `${size.case} has ${size.children}`);
  if (few.length > 0) return { outcome: "no read", reason: `the budget needs ${MIN_CHILDREN} children at each size: ${few.join(", ")}`, sizes, uncovered };
  if (sizes.some((size) => size.outcome === "beyond")) {
    // A slower model can go past the budget with the same code. A block on a model outside the runs of the budget is thus no read.
    if (uncovered.length > 0) return { outcome: "no read", reason: `the block goes past the budget (${list("beyond")}), and jobs ran on CPU models outside the runs of the budget: ${uncovered.join(", ")}`, sizes, uncovered };
    return { outcome: "block", reason: `the sliced block goes past the budget: ${list("beyond")}`, sizes, uncovered };
  }
  return { outcome: "pass", reason: undefined, sizes, uncovered };
}
