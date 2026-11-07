/**
 * The growth gate of the fan-out bench (roadmap CLI-90). The time of one publish must grow less than 15 times for each
 * 10 times more subscribers. A cost that grows as n x n grows 100 times. The gate reads the ratio inside each job, so
 * the speed of a runner does not change the verdict.
 *
 * Only the case `total` is a gate: the time to reach all subscribers. The case `block` of the arm `sliced` is one slice,
 * so its growth is a report.
 */

import { type GrowthRound, type GrowthVerdict, type PairedTime, growthVerdict } from "@mark1russell7/rigor-bench";
import { parseCase } from "./fan-out-cases.js";

/** The largest growth of the time of a publish for each 10 times more subscribers. */
export const MAX_GROWTH = 15;

/**
 * The least jobs of a gate. With 3 jobs, the interval of a step is the range of the jobs, so one job decides it.
 * The run 42399340081 of 3 jobs gave an upper bound of 14.68x, near the limit. A read of fewer jobs is a no read.
 */
export const MIN_JOBS = 5;

/** The records of one job. */
export interface GrowthJob {
  readonly job: string;
  readonly candidate: readonly PairedTime[];
}

/** The arms of the bench: `a` is `plain`, and `b` is `sliced`. */
export type FanOutArm = "plain" | "sliced";

/** This function gives the rounds of one measure and one arm, for the growth verdict. */
export function growthRounds(jobs: readonly GrowthJob[], measure: "block" | "total", arm: FanOutArm): GrowthRound[] {
  const side = arm === "plain" ? "a" : "b";
  return jobs.flatMap(({ job, candidate }) =>
    candidate.flatMap((record) => {
      const { measure: m, subscribers } = parseCase(record.case);
      return m === measure ? [{ job, size: subscribers, value: record[side] }] : [];
    }),
  );
}

/** The outcome of the gate: `no read` is not a pass. */
export type GrowthGateOutcome = "pass" | "block" | "no read";

/** The verdicts of the gate and of the report. */
export interface FanOutGrowth {
  readonly outcome: GrowthGateOutcome;
  /** The text that tells why the gate does not pass, or undefined for a pass. */
  readonly reason: string | undefined;
  /** The verdicts of the case `total`, or undefined when the jobs have no case `total`. */
  readonly gate: Readonly<Record<FanOutArm, GrowthVerdict>> | undefined;
  /** The verdicts of the case `block`, or undefined when the jobs have no case `block` (the run of a pull request). */
  readonly report: Readonly<Record<FanOutArm, GrowthVerdict>> | undefined;
}

/** This function gives the growth gate of the case `total` in each arm, and the growth of the case `block` as a report. */
export function fanOutGrowth(jobs: readonly GrowthJob[]): FanOutGrowth {
  const verdict = (measure: "block" | "total", arm: FanOutArm): GrowthVerdict => growthVerdict(growthRounds(jobs, measure, arm), { maxGrowth: MAX_GROWTH });
  // A growth needs two sizes. A measure that the jobs time at fewer sizes has no verdict.
  const sizes = (measure: "block" | "total"): number => new Set(growthRounds(jobs, measure, "plain").map((round) => round.size)).size;
  const both = (measure: "block" | "total") => (sizes(measure) < 2 ? undefined : { plain: verdict(measure, "plain"), sliced: verdict(measure, "sliced") });
  const gate = both("total");
  const report = both("block");
  if (gate === undefined) return { outcome: "no read", reason: "the jobs time the case total at fewer than 2 sizes", gate, report };
  const count = new Set(jobs.map(({ job }) => job)).size;
  if (count < MIN_JOBS) return { outcome: "no read", reason: `the gate needs ${MIN_JOBS} jobs or more, and the run has ${count}`, gate, report };
  const steps = (Object.keys(gate) as FanOutArm[]).flatMap((arm) => gate[arm].steps.map((step) => ({ arm, step })));
  const text = (outcome: string): string =>
    steps
      .filter(({ step }) => step.outcome === outcome)
      .map(({ arm, step }) => `${arm} ${step.from} to ${step.to}: ${step.median.toFixed(1)}x (${step.low.toFixed(1)} to ${step.high.toFixed(1)}), limit ${MAX_GROWTH}x`)
      .join("; ");
  if (steps.some(({ step }) => step.outcome === "beyond")) return { outcome: "block", reason: `the time of a publish grows too fast: ${text("beyond")}`, gate, report };
  if (steps.some(({ step }) => step.outcome === "cannot decide")) return { outcome: "no read", reason: `the interval crosses the limit: ${text("cannot decide")}. Add jobs up to the budget.`, gate, report };
  return { outcome: "pass", reason: undefined, gate, report };
}
