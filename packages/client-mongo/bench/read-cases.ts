/**
 * The cases of the change read bench (roadmap CLI-91). A case is `<kind>-<documents>`:
 *
 * - `first`: a read with no version, the full result.
 * - `none`: a delta read of the current version, with no change.
 * - `one`: a delta read with one changed document.
 * - `fresh`: the same read as `one`, on a `db` option that makes a new `Db` at each call, as the default connection does.
 *
 * All other kinds use one `Db` object.
 */

/** The kinds of a read. */
export const READ_KINDS = ["first", "none", "one", "fresh"] as const;

/** One kind of a read. */
export type ReadKind = (typeof READ_KINDS)[number];

/** The cases of the bench. The A/A band needs five cases. */
export const READ_CASES = ["first-1", "first-100", "none-1", "none-100", "one-1", "fresh-1"] as const;

/** The arms of the suite `read-bound`: the change reads of one client at one time. The source has 32, and the arm `after` has this value. */
export const SHARE_SIZES = [4, 8, 16] as const;

/** The reads of a burst. */
export const BURST_READS = 1_000;

/** The size of the JSON of a document in a case with one document: the size of a real document. */
export const LARGE_BYTES = 32_000;

/** The size of the JSON of a document in a case with more documents. */
export const SMALL_BYTES = 1_000;

/** This function reads the kind and the count of documents from the id of a case. */
export function parseReadCase(id: string): { kind: ReadKind; documents: number } {
  const [kind, size] = id.split("-");
  const documents = Number(size);
  if (!READ_KINDS.includes(kind as ReadKind) || !Number.isInteger(documents) || documents < 1) throw new RangeError(`no case ${id}`);
  return { kind: kind as ReadKind, documents };
}

/** One line of the counts of a child. A time is in milliseconds. */
export interface ReadCount {
  readonly job: string;
  readonly arm: string;
  readonly case: string;
  /** The time of the burst. */
  readonly burstMs: number;
  /** The reads in a second of the burst. */
  readonly readsPerSecond: number;
  /** The commands of one read alone. */
  readonly commands: number;
  /** The commands of one read alone that write. */
  readonly writes: number;
  /** The worst time of a query of the same pool during the burst. */
  readonly probeMs: number;
  /** The median time of a query of the same pool during the burst. */
  readonly probeP50Ms: number;
  /** The 95th percentile of a query of the same pool during the burst. */
  readonly probeP95Ms: number;
  /** The worst time of a query of another client during the burst. That client has its own pool and the same event loop. */
  readonly otherMs: number;
  /** The median time of a query of another client during the burst. */
  readonly otherP50Ms: number;
  /** The 95th percentile of a query of another client during the burst. */
  readonly otherP95Ms: number;
  /** The worst delay of the event loop during the burst. */
  readonly loopMaxMs: number;
  /** The connections that the server has at the end of the burst, over the count before the burst. */
  readonly connections: number;
}
