/**
 * The cases of the write burst bench (roadmap CLI-93). A case is `<shape>-<writes>`: the writes that run
 * at the same time on each store of the shape. All stores use the default connection, with no `db` option.
 *
 * - `one`: one store, one collection.
 * - `many`: 100 stores, one collection for each store.
 * - `part`: 100 stores, one partition for each store, in one collection.
 */

/** The shapes of a burst. */
export const WRITE_SHAPES = ["one", "many", "part"] as const;

/** One shape of a burst. */
export type WriteShape = (typeof WRITE_SHAPES)[number];

/** The cases of the bench. */
export const WRITE_CASES = ["one-1", "one-10", "one-100", "many-1", "many-10", "many-100", "part-1", "part-10"] as const;

/** The stores of the shapes `many` and `part`. */
export const STORES = 100;

/** The size of the JSON of a document. */
export const WRITE_BYTES = 1_000;

/** This function reads the shape and the writes from the id of a case. */
export function parseWriteCase(id: string): { shape: WriteShape; writes: number } {
  const [shape, size] = id.split("-");
  const writes = Number(size);
  if (!WRITE_SHAPES.includes(shape as WriteShape) || !Number.isInteger(writes) || writes < 1) throw new RangeError(`no case ${id}`);
  return { shape: shape as WriteShape, writes };
}

/** This function gives the bursts of a case: a small burst repeats, so that its time is above the noise of one write. */
export function burstsOf(total: number): number {
  return Math.max(1, Math.ceil(50 / total));
}

/** One line of the counts of a child. A time is in milliseconds. */
export interface WriteCount {
  readonly job: string;
  readonly arm: string;
  readonly case: string;
  /** The time of all bursts of the child, with no first writes. */
  readonly burstMs: number;
  /** The median time of one burst. */
  readonly medianBurstMs: number;
  /** The time of each burst, in order. */
  readonly burstTimesMs: readonly number[];
  readonly writesPerSecond: number;
  /** The 95th percentile of the time of one write. */
  readonly p95Ms: number;
  /** The writes that ended in an error. */
  readonly failures: number;
  /** The count and the first message of each kind of failure, because a count alone cannot tell the cause. */
  readonly errors: Readonly<Record<string, KeptError>>;
}

/** One kind of failure of a bench. */
export interface KeptError {
  readonly count: number;
  readonly message: string;
}

/** This function adds a failure to its kind: the name of the error and its code. It keeps the first message of the kind. */
export function keepError(errors: Record<string, KeptError>, error: unknown): void {
  const { name, code, message } = error as { name?: unknown; code?: unknown; message?: unknown };
  const kind = `${String(name)}:${String(code)}`;
  errors[kind] = { count: (errors[kind]?.count ?? 0) + 1, message: errors[kind]?.message ?? String(message).slice(0, 300) };
}

/** This function pools the kept failures of many lines. */
export function poolErrors(lines: readonly { readonly errors?: Readonly<Record<string, KeptError>> | undefined }[]): Record<string, KeptError> {
  const pooled: Record<string, KeptError> = {};
  for (const line of lines) {
    for (const [kind, kept] of Object.entries(line.errors ?? {})) {
      pooled[kind] = { count: (pooled[kind]?.count ?? 0) + kept.count, message: pooled[kind]?.message ?? kept.message };
    }
  }
  return pooled;
}
