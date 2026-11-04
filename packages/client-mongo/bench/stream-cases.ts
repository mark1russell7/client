/**
 * The cases of the stream bench (roadmap CLI-92). Each case has a count of partitions, with one view
 * for each partition on one source. The rungs are the acceptance of the roadmap item.
 */

/** The rungs that a start before the change finishes, so that both arms have a time. */
export const PAIRED_RUNGS = [1, 100] as const;

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
  /** The longest block of the event loop during the burst. */
  readonly burstBlockMs: number;
  /** The resident memory of the child at the end of the start, in MB. */
  readonly clientMb: number;
  /** The resident memory of the server at the end of the start, in MB. */
  readonly serverMb: number;
}
