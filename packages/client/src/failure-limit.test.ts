/**
 * The tests of the limit of the failures of one soak run (roadmap O88). These tests are fast: they
 * start no server.
 */

import { describe, it, expect } from "vitest";
import { failureLimit, poissonAtMost, upperFailureRate } from "../test/failure-limit.js";

describe("the limit of the failures of a soak run (O88)", () => {
  it("gives 3 for 0 failures in 5 runs of 175000 calls and a run of 175000 calls (p * N = 0.6)", () => {
    const runs = { calls: 5 * 175_000, failures: 0 };
    expect(upperFailureRate(runs) * 175_000).toBeCloseTo(0.6, 10);
    expect(failureLimit(runs, 175_000)).toBe(3);
  });

  it("gives 3 for the 5 HTTP runs of O85 and a run with the calls of the worst run", () => {
    const calls = 177_093 + 187_858 + 175_583 + 187_641 + 175_003;
    expect(failureLimit({ calls, failures: 0 }, 175_003)).toBe(3);
  });

  it("gives 8 for 0 failures in 1000 calls and a run of 1000 calls (p * N = 3)", () => {
    expect(failureLimit({ calls: 1000, failures: 0 }, 1000)).toBe(8);
    expect(1 - poissonAtMost(8, 3)).toBeLessThan(0.01);
    expect(1 - poissonAtMost(7, 3)).toBeGreaterThanOrEqual(0.01);
  });

  it("gives the exact Poisson bound for 1 failure: P(Poisson(4.744) <= 1) = 5 %", () => {
    expect(upperFailureRate({ calls: 1, failures: 1 })).toBeCloseTo(4.744, 3);
  });

  it("gives a higher limit for a longer run", () => {
    const runs = { calls: 875_000, failures: 0 };
    expect(failureLimit(runs, 10 * 175_000)).toBeGreaterThan(failureLimit(runs, 175_000));
  });

  it("refuses measured runs without calls", () => {
    expect(() => failureLimit({ calls: 0, failures: 0 }, 1000)).toThrow(/need calls/);
  });
});
