/**
 * The order and the records of a paired write child (roadmap CLI-114). One child loads three sources: the base
 * (`before`), this tree (`after`) and a second copy of the base (`copy`). It sends their bursts in turn, so a slow
 * period of the runner falls on each source of a pair. Two fresh children of a pair start at different times. On the
 * runs of CLI-114, a slow period moved one child of a pair and not the other.
 *
 * The candidate pair is `before` and `after`. The A/A pair is `before` and `copy`: two copies of one source, so its
 * spread is the noise of the order alone. The rules of this order go to the shared bench harness of rigor (planned),
 * as a paired-child mode of `freshRun`. This module keeps them local until that mode exists.
 */

import { firstArm, type PairedTime } from "@mark1russell7/rigor-bench";
import { median } from "@mark1russell7/rigor-statistics";

/** The sources of a paired child. */
export const WRITE_LABELS = ["before", "after", "copy"] as const;

/** A source of a paired child. */
export type WriteLabel = (typeof WRITE_LABELS)[number];

/** The two pairs of a paired child: the candidate pair and the A/A pair. */
export type WritePair = "candidate" | "aa";

/** One burst of the order: the pair that it counts for, and the source that sends it. */
export interface PairedStep {
  readonly pair: WritePair;
  readonly label: WriteLabel;
}

/** The second source of each pair. The first source of each pair is `before`. */
const OTHER: Readonly<Record<WritePair, WriteLabel>> = { candidate: "after", aa: "copy" };

/**
 * This function gives the order of the bursts of one child, for the global `round` and the index of the case.
 * - Each step has a block of four bursts for each pair, in the order A B B A. A is the arm that `firstArm` starts first.
 * - The two blocks change places at each step, and the first block turns each round.
 * - Each source of a pair thus sends two bursts in each step, one before and one after the other source.
 */
export function pairedSchedule(round: number, caseIndex: number, steps: number): PairedStep[] {
  if (!Number.isInteger(steps) || steps < 1) throw new RangeError(`a paired child needs 1 step or more, not ${steps}`);
  const first = firstArm(round, caseIndex);
  const block = (pair: WritePair): PairedStep[] => {
    const [x, y]: WriteLabel[] = first === "a" ? ["before", OTHER[pair]] : [OTHER[pair], "before"];
    return [x, y, y, x].map((label) => ({ pair, label: label as WriteLabel }));
  };
  const order: PairedStep[] = [];
  for (let step = 0; step < steps; step++) {
    const candidateFirst = (step + round) % 2 === 0;
    order.push(...(candidateFirst ? [...block("candidate"), ...block("aa")] : [...block("aa"), ...block("candidate")]));
  }
  return order;
}

/** The two records of one paired child: the time of each arm is the median of its bursts in that pair. */
export interface PairedRecords {
  readonly candidate: PairedTime;
  readonly aa: PairedTime;
}

/** This function gives the burst times of each source of each pair, in the order of the bursts. */
export function timesOfPairs(order: readonly PairedStep[], times: readonly number[]): Record<WritePair, Record<WriteLabel, number[]>> {
  if (order.length !== times.length) throw new RangeError(`${times.length} times for ${order.length} bursts`);
  const out: Record<WritePair, Record<WriteLabel, number[]>> = { candidate: { before: [], after: [], copy: [] }, aa: { before: [], after: [], copy: [] } };
  order.forEach((step, index) => out[step.pair][step.label].push(times[index] as number));
  return out;
}

/** This function gives the records of one paired child from its order and the time of each burst. */
export function pairedRecords(caseName: string, round: number, caseIndex: number, order: readonly PairedStep[], times: readonly number[]): PairedRecords {
  const first = firstArm(round, caseIndex);
  const byPair = timesOfPairs(order, times);
  const record = (pair: WritePair): PairedTime => ({ case: caseName, round, first, a: median(byPair[pair].before), b: median(byPair[pair][OTHER[pair]]) });
  return { candidate: record("candidate"), aa: record("aa") };
}
