/**
 * Seeded random numbers for the fault tests (roadmap R30).
 *
 * The same seed gives the same numbers, so a failing run replays: start the test again with
 * `FAULT_SEED=<seed>`, and it makes the same choices.
 */

/** A function that gives a number from 0 (included) to 1 (excluded). */
export type Random = () => number;

/** This function gives the generator of a seed (the mulberry32 algorithm). */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** This function gives an integer from `min` to `max`, both included. */
export function integerOf(random: Random, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

/**
 * The seeds of a test run: the seed of the `FAULT_SEED` environment variable, or the given seeds.
 * A test names its seed in each failure message, so a failing run can replay.
 */
export function seedsOf(defaults: readonly number[]): number[] {
  const given = process.env["FAULT_SEED"];
  if (given === undefined || given.trim() === "") return [...defaults];
  const seed = Number(given);
  if (!Number.isInteger(seed)) throw new Error(`FAULT_SEED must be an integer, got ${given}`);
  return [seed];
}
