/**
 * The cases of the fan-out bench (roadmap CLI-90). Each size has two cases: the longest block of the
 * event loop, and the time to reach all subscribers. The sizes are the acceptance of the roadmap item.
 */

/** The size of a slice in the arm `sliced`. */
export const SLICE_SIZE = 256;

const SIZES = [1_000, 10_000, 100_000] as const;

/**
 * The longest time of one child of the bench, in milliseconds. A child over it in the first round of a job skips its case,
 * and the growth gate blocks (roadmap CLI-90). A child at 100,000 subscribers takes approximately 30 s on the fixed code.
 * Each job of run 42386486346 took 26 to 33 minutes for 48 such children. On the old code, the publish alone takes
 * over 100 s. Thus a job on a slow code ends in time, with a reason.
 */
export const CHILD_LIMIT_MS = 120_000;

export const FAN_OUT_CASES: readonly string[] = SIZES.flatMap((size) => [`block-${size}`, `total-${size}`]);

/** This function reads the measure and the size from the id of a case. */
export function parseCase(id: string): { readonly measure: "block" | "total"; readonly subscribers: number } {
  const [measure, size] = id.split("-");
  const subscribers = Number(size);
  if ((measure !== "block" && measure !== "total") || !Number.isInteger(subscribers)) throw new RangeError(`no case ${id}`);
  return { measure, subscribers };
}
