/**
 * This test pins the seeded random numbers of the fault tests across their move to `mulberry32` of
 * `@mark1russell7/rigor-generators` (CA14). The old copy is kept here as a fixture. Each seed of
 * `FAULT_SEED` gives the same numbers as before, so a recorded failure replays.
 */

import { describe, expect, it } from "vitest";
import { random } from "@mark1russell7/rigor-generators";
import { seededRandom } from "../../test/faults/random.js";

/** The old copy of `seededRandom`. */
function oldSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("seededRandom moves to mulberry32 of rigor-generators (CA14)", () => {
  it("gives the old numbers for each seed", () => {
    const seeds = random("faults-random-seeds");
    const cases = [0, 1, -1, 0x5eed, 2 ** 32, 2 ** 53 - 1, 0.5, ...Array.from({ length: 200 }, () => seeds.int(-(2 ** 31), 2 ** 32))];
    for (const seed of cases) {
      const before = oldSeededRandom(seed);
      const after = seededRandom(seed);
      for (let draw = 0; draw < 50; draw++) expect(after(), `seed ${seed}, draw ${draw}`).toBe(before());
    }
  });
});
