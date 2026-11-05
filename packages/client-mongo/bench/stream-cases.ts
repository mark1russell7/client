/**
 * The cases of the stream bench (roadmap CLI-92). Each case has a count of partitions, with one view
 * for each partition on one source. The rungs are the acceptance of the roadmap item.
 */

import { random } from "@mark1russell7/rigor-generators";

/**
 * These rungs have a start before the change that finishes, so both arms have a time. A stream for
 * each view fills the default pool over about 100 partitions. The A/A band needs five cases.
 */
export const PAIRED_RUNGS = [1, 3, 10, 30, 100] as const;

/** The top rung. A start before the change does not finish on the default pool. */
export const TOP_RUNG = 1_000;

/** The size of the pool that lets a start before the change finish at the top rung. */
export const WIDE_POOL = 3_000;

/** This function gives the id of the case of a rung. */
export const caseId = (partitions: number): string => `ready-${partitions}`;

/** This function reads the count of partitions from the id of a case. */
export function parseCase(id: string): number {
  const [measure, size] = id.split("-");
  const partitions = Number(size);
  if (measure !== "ready" || !Number.isInteger(partitions) || partitions < 1) throw new RangeError(`no case ${id}`);
  return partitions;
}

/** The documents of each partition: `DOCS` for the view, and one that the burst deletes. */
export const DOCS = 5;

/** The kinds of a family of views: one pipeline text for all partitions, or a text for each partition. */
export type ViewFamily = "equal" | "varied";

/** The pipeline of the family `equal`. */
const EQUAL_PIPELINE = [{ $group: { _id: "$kind", total: { $sum: "$n" } } }];

/**
 * This function gives the pipeline of the view of a partition. A varied pipeline has a seeded match, project and length, and its own field name.
 * The partition 0 keeps the equal text, because the bench reads its total after an insert.
 */
export function viewPipeline(family: ViewFamily, index: number): object[] {
  if (family === "equal" || index === 0) return EQUAL_PIPELINE;
  const draw = random(`stream-views-${index}`);
  const stages: object[] = [{ $match: draw.chance(0.5) ? { n: { $lte: draw.int(1, DOCS) } } : { kind: { $in: ["a", "b"] }, n: { $gte: draw.int(0, 1) } } }];
  for (let extra = draw.int(0, 2); extra > 0; extra--) {
    stages.push(draw.chance(0.5) ? { $project: { kind: 1, n: 1, [`tag${draw.int(0, 999)}`]: { $literal: draw.int(0, 999) } } } : { $match: { n: { $gte: 0, $lt: draw.int(DOCS + 1, 1000) } } });
  }
  stages.push({ $group: { _id: "$kind", total: { $sum: "$n" }, [`most${index}`]: { $max: "$n" } } });
  return stages;
}

/** One line of the counts of a child. A time is in milliseconds. */
export interface StreamCount {
  readonly job: string;
  readonly arm: string;
  readonly partitions: number;
  /** The size of the pool, or 0 for the default of the driver. */
  readonly pool: number;
  /** False when the start did not finish before the cap. */
  readonly ready: boolean;
  readonly readyMs: number;
  /** The open change streams at the end of the start, or at the cap. */
  readonly streams: number;
  /** The worst time of a query of the same pool during the start. */
  readonly startProbeMs: number;
  readonly queries: number;
  readonly updates: number;
  /** The connections that the server has after the start and the idle time, over the count before the start. */
  readonly connections: number;
  /** The `getMore` commands in the idle time. */
  readonly idleGetMore: number;
  /** The time from an insert to the row of the view. */
  readonly deliverMs: number;
  /** False when the passes of the burst did not end before the cap. */
  readonly burstEnded: boolean;
  /** The time from a delete in each partition to the end of the last pass. */
  readonly burstMs: number;
  /** The worst time of a query of the same pool during the burst. */
  readonly burstProbeMs: number;
  /** The connections that the server has at the end of the burst, over the count before the start. */
  readonly burstConnections: number;
  /** The longest block of the event loop during the burst. */
  readonly burstBlockMs: number;
  /** The resident memory of the child at the end of the start, in MB. */
  readonly clientMb: number;
  /** The resident memory of the server at the end of the start, in MB. */
  readonly serverMb: number;
  /** The different pipeline texts of the views of the child. */
  readonly distinctPipelines: number;
}
