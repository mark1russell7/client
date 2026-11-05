/**
 * The cases of the slow partition bench (roadmap CLI-97). The case `slow-<n>` has `n` slow partitions
 * in `PARTITIONS` partitions on one source.
 */

/** The partitions of each case. */
export const PARTITIONS = 1000;

/** The slow partitions of the cases. The number 32 is the limit of the passes at one time. */
const SLOW_COUNTS = [0, 1, 32, 100] as const;

/** The time of a pass of a slow partition. */
export const SLOW_MS = 5_000;

/** The changes in normal partitions, one each `PROBE_EVERY_MS`, and the time that they cover. */
export const PROBES = 40;

/** The time between two changes in normal partitions. */
export const PROBE_EVERY_MS = 500;

/** All cases. */
export const SLOW_CASES: readonly string[] = SLOW_COUNTS.map((count) => `slow-${count}`);

/** This function reads the slow partitions of a case. */
export function parseSlowCase(id: string): number {
  const count = Number(id.replace("slow-", ""));
  if (!id.startsWith("slow-") || !Number.isInteger(count)) throw new RangeError(`this case is not known: ${id}`);
  return count;
}

/**
 * This function gives the stages that make a pass of a view slow. The sleep runs on the server, so
 * the pass holds its place and its connection, as a large collection does, with almost no use of the
 * processor. The guard of the store refuses `$function`, so the guard of the bench adds these stages
 * after its own scope.
 */
export function slowStages(): object[] {
  return [{ $limit: 1 }, { $set: { slept: { $function: { body: `function() { sleep(${SLOW_MS}); return 1; }`, args: [], lang: "js" } } } }];
}

/** One line of the counts of a child. A time is in milliseconds. */
export interface SlowCount {
  readonly job: string;
  readonly arm: string;
  readonly case: string;
  readonly ready: boolean;
  readonly readyMs: number;
  /** The time from each change in a normal partition to the new row of its view, in the order of the changes. */
  readonly probeMs: readonly number[];
  /** The changes whose row did not come before the cap. */
  readonly probesLost: number;
  /** The time from the changes in the slow partitions until no pass is in flight. */
  readonly slowEndMs: number;
  readonly blockMs: number;
  /** The warnings and the errors of the materializer in this child, as `<level>: <message>` with the count of each. */
  readonly logged: Readonly<Record<string, number>>;
}
