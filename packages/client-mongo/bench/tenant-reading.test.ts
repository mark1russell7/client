import { constant, schedule } from "@mark1russell7/rigor-chaos";
import { describe, expect, it } from "vitest";
import { KEEP_UP_SHARE, WINDOW_MS } from "./tenant-cases.js";
import { readingOf, type ReadingRow } from "./tenant-reading.js";

const RATE = 20;
const SECONDS = WINDOW_MS / 1000;

/** This function gives a child that kept up with a plan of this size. */
const keptUp = (planned: number): ReadingRow => ({ driverHeld: true, failures: 0, unfinished: 0, unsent: 0, writesPerSecond: planned / SECONDS, planned, p99Ms: 12 });

const plans = Array.from({ length: 200 }, (_, seed) => schedule(constant(RATE, WINDOW_MS), { arrivals: "poisson", seed: `reading/${seed}` }).times.length);

describe("the reading of a child of the tenant bench", () => {
  it("passes each Poisson plan that the child kept up with, inside the spread of the plans", () => {
    // Without this spread, the test cannot tell the rule from its first form
    expect(plans.some((planned) => planned < KEEP_UP_SHARE * RATE * SECONDS)).toBe(true);
    for (const planned of plans) expect(readingOf([keptUp(planned)])).toEqual({ outcome: "provisional pass", reasons: [] });
  });

  it("fails a child that ended under the share of its own plan", () => {
    const planned = 400;
    const behind = { ...keptUp(planned), writesPerSecond: (KEEP_UP_SHARE - 0.01) * (planned / SECONDS) };
    expect(readingOf([behind]).outcome).toBe("fail");
    expect(readingOf([{ ...keptUp(planned), writesPerSecond: KEEP_UP_SHARE * (planned / SECONDS) }]).outcome).toBe("provisional pass");
  });

  it("fails a failure, a write with no reply and a slow tail, and gives no reading for a late driver", () => {
    expect(readingOf([{ ...keptUp(400), failures: 1 }]).outcome).toBe("fail");
    expect(readingOf([{ ...keptUp(400), unfinished: 1 }]).outcome).toBe("fail");
    expect(readingOf([{ ...keptUp(400), unsent: 1 }]).outcome).toBe("fail");
    expect(readingOf([{ ...keptUp(400), p99Ms: 1001 }]).outcome).toBe("fail");
    expect(readingOf([{ ...keptUp(400), driverHeld: false, failures: 1 }]).outcome).toBe("no reading");
  });
});
