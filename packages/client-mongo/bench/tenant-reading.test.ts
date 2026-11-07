import { constant, schedule } from "@mark1russell7/rigor-chaos";
import { describe, expect, it } from "vitest";
import { ABORT_LIMIT, KEEP_UP_SHARE, PARTITION_CASES, WINDOW_MS, parseTenantCase, type CoreShare } from "./tenant-cases.js";
import { RUNNER_FULL, abortReadingOf, abortShareOf, commitsPerWriteOf, cpuOf, limitOf, readingOf, type ReadingRow } from "./tenant-reading.js";

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
    expect(new Set(kases.map((kase) => kase.rate))).toEqual(new Set([800, 2000, 4000, 8000]));
  });
});

/** This function gives four processors with the same share of work and of a wait for the disk. */
const fourCores = (busy: number, iowait = 0): CoreShare[] => [0, 1, 2, 3].map((core) => ({ core, busy, iowait }));

describe("the processor time and the limit of a rung (roadmap CLI-96)", () => {
  it("gives the processor time of each write, of the writers and of the whole runner", () => {
    const reading = cpuOf({ writesPerSecond: 4000, writerBusy: [0.5, 0.3], cores: fourCores(0.5, 0.1) });
    // 0.8 of a processor is 800 ms each second, over 4,000 writes; 2 processors of work are 2,000 ms each second
    expect(reading).toEqual({ writerMsPerWrite: 0.2, runnerMsPerWrite: 0.5, runnerFull: 0.6, writerWorst: 0.5 });
  });

  it("gives null for a reading that the child does not have", () => {
    expect(cpuOf({ writesPerSecond: 0, writerBusy: [0.4], cores: null })).toEqual({ writerMsPerWrite: null, runnerMsPerWrite: null, runnerFull: null, writerWorst: 0.4 });
    expect(cpuOf({ writesPerSecond: 100, cores: [] })).toEqual({ writerMsPerWrite: null, runnerMsPerWrite: null, runnerFull: null, writerWorst: null });
  });

  it("names no limit for a pass", () => {
    expect(limitOf({ outcome: "provisional pass", abortsHold: true, runnerFull: 0.99, writerWorst: 0.99 })).toEqual({ limit: null, reasons: [] });
    expect(limitOf({ outcome: "provisional pass", abortsHold: null, runnerFull: 0.2, writerWorst: 0.1 }).limit).toBeNull();
  });

  it("names the runner for a full runner, a full writer or a late driver, at the limit and not under it", () => {
    expect(limitOf({ outcome: "fail", abortsHold: true, runnerFull: RUNNER_FULL, writerWorst: 0.2 }).limit).toBe("runner");
    expect(limitOf({ outcome: "fail", abortsHold: true, runnerFull: 0.5, writerWorst: RUNNER_FULL }).limit).toBe("runner");
    expect(limitOf({ outcome: "no reading", abortsHold: true, runnerFull: 0.5, writerWorst: 0.2 })).toEqual({ limit: "runner", reasons: ["a driver did not keep its schedule"] });
    expect(limitOf({ outcome: "fail", abortsHold: true, runnerFull: RUNNER_FULL - 0.001, writerWorst: RUNNER_FULL - 0.001 }).limit).toBe("design");
  });

  it("names the design for aborts over the limit or a failure with free processors, and both when the runner is also full", () => {
    expect(limitOf({ outcome: "provisional pass", abortsHold: false, runnerFull: 0.4, writerWorst: 0.2 })).toEqual({ limit: "design", reasons: ["the abort rule failed"] });
    expect(limitOf({ outcome: "fail", abortsHold: null, runnerFull: 0.4, writerWorst: 0.2 })).toEqual({ limit: "design", reasons: ["the rung failed with free processors, at 0.4 of the runner"] });
    expect(limitOf({ outcome: "fail", abortsHold: false, runnerFull: 0.95, writerWorst: 0.2 }).limit).toBe("runner and design");
  });

  it("names no limit that it cannot read", () => {
    expect(limitOf({ outcome: "fail", abortsHold: true, runnerFull: null, writerWorst: null })).toEqual({ limit: "unknown", reasons: ["the runner gave no processor times"] });
  });
});

describe("the commits of each finished write (CLI-96)", () => {
  it("divides the commits by the finished writes, not by the starts", () => {
    // 4000-p2, partition, round 1 (run 42418013417): starts minus aborts gave 30,926, the finished writes 11,589
    expect(commitsPerWriteOf({ planned: 79_873, unfinished: 68_284, transactionsCommitted: 11_589 })).toBe(1);
    expect(commitsPerWriteOf({ planned: 100, unfinished: 0, transactionsCommitted: 150 })).toBe(1.5);
  });

  it("gives null for a record with no commits or no finished write", () => {
    expect(commitsPerWriteOf({ planned: 100, unfinished: 0 })).toBeNull();
    expect(commitsPerWriteOf({ planned: 100, unfinished: 100, transactionsCommitted: 0 })).toBeNull();
  });
});
