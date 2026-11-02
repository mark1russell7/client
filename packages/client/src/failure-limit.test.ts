/**
 * The tests of the limit of the failures of one soak run (roadmap O88). These tests are fast: they
 * start no server.
 */

import { describe, it, expect } from "vitest";
import { failureLimit, gateLimit, poissonAtMost, upperFailureRate } from "../test/failure-limit.js";

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

describe("the limit of a gate from 5 runs: the worst run and the spread (O88)", () => {
  it("gives the soak ceilings of nightly run 41371616323", () => {
    expect(gateLimit([3.1, 2.84, 2.96, 2.82, 2.91], "ceiling", 0.1)).toBe(3.4);
    expect(gateLimit([4.51, 4.51, 4.5, 4.54, 4.47], "ceiling", 0.1)).toBe(4.7);
    expect(gateLimit([0.937, 0.927, 0.928, 0.922, 0.936], "ceiling", 0.01)).toBe(0.96);
  });

  it("gives the soak floors of nightly run 41371616323", () => {
    expect(gateLimit([966_963, 1_096_935, 961_695, 1_092_157, 968_772], "floor", 1000)).toBe(826_000);
    expect(gateLimit([177_093, 187_858, 175_583, 187_641, 175_003], "floor", 1000)).toBe(162_000);
  });

  it("gives the mutation floor of the last 5 nightly runs (88.15 - 0.26 = 87.89)", () => {
    expect(gateLimit([88.36, 88.36, 88.41, 88.15, 88.41], "floor", 0.1)).toBe(87.8);
  });

  it("keeps a value that is on a step, with a spread of 0", () => {
    expect(gateLimit([4.6, 4.6, 4.6, 4.6, 4.6], "ceiling", 0.1)).toBe(4.6);
    expect(gateLimit([87.8, 87.8, 87.8, 87.8, 87.8], "floor", 0.1)).toBe(87.8);
  });

  it("refuses fewer than 5 runs and a step of 0", () => {
    expect(() => gateLimit([1, 2, 3, 4], "ceiling", 0.1)).toThrow(/at least 5 runs/);
    expect(() => gateLimit([1, 2, 3, 4, 5], "floor", 0)).toThrow(/above 0/);
  });
});
