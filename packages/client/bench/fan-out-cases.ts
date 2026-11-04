/**
 * The cases of the fan-out bench (roadmap CLI-90). Each size has two cases: the longest block of the
 * event loop, and the time to reach all subscribers. The sizes are the acceptance of the roadmap item.
 */

/** The size of a slice in the arm `sliced`. */
export const SLICE_SIZE = 256;

const SIZES = [1_000, 10_000, 100_000] as const;

export const FAN_OUT_CASES: readonly string[] = SIZES.flatMap((size) => [`block-${size}`, `total-${size}`]);

/** This function reads the measure and the size from the id of a case. */
export function parseCase(id: string): { readonly measure: "block" | "total"; readonly subscribers: number } {
  const [measure, size] = id.split("-");
  const subscribers = Number(size);
  if ((measure !== "block" && measure !== "total") || !Number.isInteger(subscribers)) throw new RangeError(`no case ${id}`);
  return { measure, subscribers };
}
