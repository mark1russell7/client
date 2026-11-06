import { constant, schedule } from "@mark1russell7/rigor-chaos";
import { describe, expect, it } from "vitest";
import { ABORT_LIMIT, KEEP_UP_SHARE, PARTITION_CASES, WINDOW_MS, parseTenantCase } from "./tenant-cases.js";
import { abortReadingOf, abortShareOf, readingOf, type ReadingRow } from "./tenant-reading.js";

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

describe("the abort rule of the tenant bench (roadmap CLI-96)", () => {
  it("reads only a case of two processes or more", () => {
    expect(abortReadingOf([{ transactionsStarted: 100, transactionsAborted: 50 }], 1)).toBeNull();
    expect(abortReadingOf([], 2)).toBeNull();
  });

  it("holds at the limit and fails over it, on the worst child", () => {
    const at = { transactionsStarted: 10_000, transactionsAborted: 10_000 * ABORT_LIMIT };
    const over = { transactionsStarted: 10_000, transactionsAborted: 10_000 * ABORT_LIMIT + 1 };
    expect(abortReadingOf([at], 2)).toEqual({ limit: ABORT_LIMIT, worst: ABORT_LIMIT, holds: true });
    expect(abortReadingOf([at, over], 2)?.holds).toBe(false);
    expect(abortReadingOf([over, at], 4)?.worst).toBe(0.0101);
  });

  it("gives no abort to a child with no transaction", () => {
    expect(abortShareOf({ transactionsStarted: 0, transactionsAborted: 0 })).toBe(0);
  });

  it("has a rung of two processes or more at each rate of the suite tenant-partition", () => {
    const kases = PARTITION_CASES.map(parseTenantCase);
    for (const rate of new Set(kases.map((kase) => kase.rate))) expect(kases.some((kase) => kase.rate === rate && kase.processes >= 2)).toBe(true);
    expect(new Set(kases.map((kase) => kase.rate))).toEqual(new Set([800, 8000]));
  });
});
