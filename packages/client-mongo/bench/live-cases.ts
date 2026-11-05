/**
 * The cases of the live state bench: one connection for each writer, at 8 sets a second each, and one reader. The arm
 * `store` sets a document in a collection on a real MongoDB, and its reader reads the changes after each hint. The arm
 * `live` calls `live.set`, and its reader takes the values from the events. Both arms serve the same collection, so a
 * store write of the arm `live` shows in the same counters.
 */

/** The arms. The first arm is the base of the pairs. */
export const LIVE_ARMS = ["store", "live"] as const;
/** An arm of the bench. */
export type LiveArm = (typeof LIVE_ARMS)[number];

/** The cases: the number of writers. */
export const LIVE_CASES = ["w1", "w10", "w100"] as const;

/** The sets of one writer in a second. */
export const SETS_PER_SECOND = 8;

/** The time in which the writers send, in milliseconds. */
export const LOAD_MS = 20_000;

/** The time after the load in which a reply or a value still counts, in milliseconds. */
export const GRACE_MS = 3_000;

/** This function gives the number of writers of a case. */
export function writersOf(name: string): number {
  const match = /^w([1-9]\d*)$/.exec(name);
  if (match === null) throw new RangeError(`"${name}" is not a case of the live state bench`);
  return Number(match[1]);
}

/** The sets of one child at this number of writers. */
export function plannedSets(writers: number): number {
  return writers * SETS_PER_SECOND * (LOAD_MS / 1000);
}

/** The line of one child in the file of the counts. */
export interface LiveCount {
  readonly job: number;
  readonly arm: LiveArm;
  readonly case: string;
  readonly planned: number;
  readonly replied: number;
  readonly failures: number;
  /** The inserts, updates and removes of the namespaces of the bench database, from the command `top`. */
  readonly storeWrites: number;
  /** The transactions of the server that committed in the load and the grace. */
  readonly transactions: number;
  /** The time from a send to its reply, in milliseconds. */
  readonly replyP50Ms: number;
  readonly replyP99Ms: number;
  /** The time from a send to the reader that holds the value, in milliseconds. A value that a later value replaced has no time. */
  readonly readerP50Ms: number;
  readonly readerP95Ms: number;
  readonly readerP99Ms: number;
  /** The values that the reader got, and the events and the reads that carried them. */
  readonly readerValues: number;
  readonly readerEvents: number;
  readonly readerReads: number;
  /** The bytes of the events and the reads of the reader, as JSON. */
  readonly readerBytes: number;
  /** The processor time of the one process, for the server, the writers and the reader together, in milliseconds. */
  readonly cpuMs: number;
  /** The p99 of the delay of the event loop of the process, in milliseconds. */
  readonly loopP99Ms: number;
  /** The first text of each kind of failure, with its count. */
  readonly errors: Readonly<Record<string, { readonly count: number; readonly text: string }>>;
}

/** This function tells if the arm kept up: 95 % of the plan had a reply, with no failure, and the reader p99 is at most 1,000 ms. */
export function keptUp(count: Pick<LiveCount, "planned" | "replied" | "failures" | "readerP99Ms">): boolean {
  return count.replied >= 0.95 * count.planned && count.failures === 0 && count.readerP99Ms <= 1000;
}
