/** The tests of the verdict of the speed gate of the store (roadmap CLI-94). The rounds are data, so the tests do not depend on the computer. */

import { describe, expect, it } from "vitest";
import type { JobRecords, PairedTime } from "@mark1russell7/rigor-bench";
import { BLOCK_EXIT, NO_READ_EXIT, READ_CASES, WRITE_CASES, caseLimits, heldSlowdown, joinJobs, outcomeAtCaseLimits, overStated, passingLimit, rerunCounts, shortOfLastLook, storeGate } from "./gate-verdict.js";

const CASES = [...READ_CASES, ...WRITE_CASES];
const LIMIT = 1.1;
const everyCase = (limit: number): Record<string, number> => Object.fromEntries(CASES.map((name) => [name, limit]));
const INPUT = { limits: everyCase(LIMIT), reportOnly: [], failures: 0, attempt: 1 };

/** This function makes the records of a case, with the ratio that `ratioOf` gives for each round. The order turns each round. */
function rounds(name: string, from: number, count: number, ratioOf: (round: number) => number): PairedTime[] {
  return Array.from({ length: count }, (_, i) => {
    const round = from + i;
    return { case: name, round, first: round % 2 === 0 ? ("a" as const) : ("b" as const), a: 100, b: 100 * ratioOf(round) };
  });
}

function jobOf(job: string, ratioOf: (name: string, round: number) => number, count = 12, from = 0, names: readonly string[] = CASES): JobRecords {
  return {
    job,
    candidate: names.flatMap((name) => rounds(name, from, count, (round) => ratioOf(name, round))),
    aa: names.flatMap((name) => rounds(name, from, count, () => 1)),
  };
}

const same = (): number => 1;

describe("storeGate", () => {
  it("passes a head with the speed of its base", () => {
    const gate = storeGate([jobOf("1", same), jobOf("2", same)], INPUT);
    expect(gate).toMatchObject({ outcome: "pass", exitCode: 0, more: [] });
    expect(gate.text).toMatch(/^PASS/);
  });

  it("blocks a head that is slower in one case in both jobs", () => {
    const slower = (name: string): number => (name === "part-1" ? 1.3 : 1);
    const gate = storeGate([jobOf("1", slower), jobOf("2", slower)], INPUT);
    expect(gate).toMatchObject({ outcome: "block", exitCode: BLOCK_EXIT });
    expect(gate.verdict.blocks).toEqual(["part-1"]);
    expect(gate.text).toMatch(/^BLOCK/);
  });

  it("does not block on one slower job, and asks for the next look", () => {
    const slower = (name: string): number => (name === "part-1" ? 1.3 : 1);
    const gate = storeGate([jobOf("1", slower), jobOf("2", same)], INPUT);
    expect(gate).toMatchObject({ outcome: "no read", exitCode: NO_READ_EXIT, more: ["part-1"] });
    expect(gate.text).toMatch(/^NO READ/);
    expect(gate.text).toContain("not a block and not a pass");
  });

  it("counts a stall of one round as one pair, and not as a slower head", () => {
    const stall = (name: string, round: number): number => (name === "many-1" && round === 3 ? 4 : 1);
    expect(storeGate([jobOf("1", stall), jobOf("2", stall)], INPUT).outcome).toBe("pass");
  });

  it("decides a case with no outcome at the second look, from the files of both looks", () => {
    const stalls = (name: string, round: number): number => (name === "part-1" && [0, 4, 8].includes(round) ? 1.3 : 1);
    const first = [jobOf("1", stalls), jobOf("2", stalls)];
    expect(storeGate(first, INPUT).more).toEqual(["part-1"]);
    const second = [jobOf("1", stalls, 12, 12, ["part-1"]), jobOf("2", stalls, 12, 12, ["part-1"])];
    expect(storeGate(joinJobs([...first, ...second]), INPUT).outcome).toBe("pass");
  });

  it("gives a final no read after the last look", () => {
    const half = (name: string, round: number): number => (name === "part-1" && round % 2 === 0 ? 1.3 : 1);
    const files = [jobOf("1", half), jobOf("2", half), jobOf("1", half, 12, 12, ["part-1"]), jobOf("2", half, 12, 12, ["part-1"])];
    expect(storeGate(joinJobs(files), INPUT)).toMatchObject({ outcome: "no read", exitCode: NO_READ_EXIT, more: [] });
  });

  it("reads no read, and not a pass, when a case of the gate has no records", () => {
    const names = CASES.filter((name) => name !== "one-1");
    const gate = storeGate([jobOf("1", same, 12, 0, names), jobOf("2", same, 12, 0, names)], INPUT);
    expect(gate).toMatchObject({ outcome: "no read", exitCode: NO_READ_EXIT });
    expect(gate.text).toContain("one-1");
  });

  it("reads no read with one job, because a case needs the bound in 2 jobs", () => {
    expect(storeGate([jobOf("1", same)], INPUT).outcome).toBe("no read");
  });

  it("blocks on a failed write of the head", () => {
    expect(storeGate([jobOf("1", same), jobOf("2", same)], { ...INPUT, failures: 2 })).toMatchObject({ outcome: "block", exitCode: BLOCK_EXIT });
  });

  it("states the attempt, because a rerun is a further look", () => {
    expect(storeGate([jobOf("1", same), jobOf("2", same)], { ...INPUT, attempt: 3 }).text).toContain("Attempt 3.");
  });
});

describe("joinJobs", () => {
  it("joins two files of a job and keeps two jobs apart", () => {
    const joined = joinJobs([jobOf("1", same), jobOf("2", same), jobOf("1", same, 12, 12)]);
    expect(joined.map((job) => [job.job, job.candidate.length / CASES.length])).toEqual([["1", 24], ["2", 12]]);
  });
});

describe("passingLimit", () => {
  it("gives a limit just above the ratio of a steady head, and that limit passes", () => {
    const steady = (): number => 1.05;
    const jobs = [jobOf("1", steady), jobOf("2", steady)];
    const limit = passingLimit(jobs);
    expect(limit).toBeGreaterThan(1.05);
    expect(limit).toBeLessThan(1.052);
    expect(storeGate(jobs, { ...INPUT, limits: everyCase(limit) }).outcome).toBe("pass");
    expect(storeGate(jobs, { ...INPUT, limits: everyCase(1.04) }).outcome).toBe("block");
  });

  it("gives no finite limit when a job misses a case", () => {
    expect(passingLimit([jobOf("1", same)])).toBe(Number.POSITIVE_INFINITY);
  });

  it("reads a lower limit with the second look than with the first look alone", () => {
    // Three of the first 12 rounds stall, so the first look needs the height of a stall. The next 12 rounds are steady.
    const stalls = (name: string, round: number): number => (name === "part-1" && round % 4 === 0 && round < 12 ? 1.5 : 1.02);
    const first = [jobOf("1", stalls), jobOf("2", same)];
    const both = [jobOf("1", stalls, 24), jobOf("2", same, 24)];
    expect(passingLimit(first)).toBeGreaterThan(1.5);
    expect(passingLimit(both)).toBeLessThan(1.1);
  });
});

describe("limits per case", () => {
  it("does not block on a report-only case, and prints its read", () => {
    const slower = (name: string): number => (name === "one-10" ? 1.5 : 1);
    const gate = storeGate([jobOf("1", slower), jobOf("2", slower)], { ...INPUT, reportOnly: ["one-10"] });
    expect(gate.outcome).toBe("pass");
    expect(gate.verdict.cases.map((entry) => entry.case)).not.toContain("one-10");
    expect(gate.reported.map((entry) => entry.case)).toEqual(["one-10"]);
  });

  it("does not need the records of a report-only case", () => {
    const names = CASES.filter((name) => name !== "one-10");
    const gate = storeGate([jobOf("1", same, 12, 0, names), jobOf("2", same, 12, 0, names)], { ...INPUT, reportOnly: ["one-10"] });
    expect(gate.outcome).toBe("pass");
    expect(gate.reported).toEqual([]);
  });

  it("stops at a gate case with no limit, because no limit is not a pass", () => {
    const { "part-1": _gone, ...limits } = everyCase(LIMIT);
    expect(() => storeGate([jobOf("1", same), jobOf("2", same)], { ...INPUT, limits })).toThrow("the case part-1 has no limit");
  });

  it("reads each case at its own limit", () => {
    const ratio = (name: string): number => (name === "part-1" ? 1.2 : 1.02);
    const jobs = [jobOf("1", ratio), jobOf("2", ratio)];
    expect(storeGate(jobs, INPUT).verdict.blocks).toEqual(["part-1"]);
    expect(storeGate(jobs, { ...INPUT, limits: { ...everyCase(LIMIT), "part-1": 1.25 } }).outcome).toBe("pass");
  });
});

describe("overStated", () => {
  const slowdowns = { "first-1": 1.15, "none-1": 1.15, "one-1": 1.15, "many-1": 1.25, "part-1": 1.25 };

  it("names a gate case with a limit at or over its slowdown, and a gate case with no slowdown", () => {
    expect(overStated({ limits: { ...everyCase(1.1), "first-1": 1.15 }, slowdowns, reportOnly: ["one-10"] })).toEqual(["first-1"]);
    expect(overStated({ limits: everyCase(1.1), slowdowns, reportOnly: [] })).toEqual(["one-10"]);
  });

  it("names nothing when each gate case holds its slowdown", () => {
    expect(overStated({ limits: everyCase(1.1), slowdowns, reportOnly: ["one-10"] })).toEqual([]);
  });
});

describe("heldSlowdown", () => {
  const steady = (): number => 1.02;

  it("gives the ratio over the limit for a steady case", () => {
    const held = heldSlowdown([jobOf("1", steady, 24), jobOf("2", steady, 24)], "part-1", everyCase(1.1));
    expect(held).toBeGreaterThan(1.07);
    expect(held).toBeLessThan(1.09);
  });

  it("gives a larger slowdown when the rounds of the case spread", () => {
    const spread = (name: string, round: number): number => (name === "part-1" && round % 3 === 0 ? 0.8 : 1.02);
    const held = heldSlowdown([jobOf("1", spread, 24), jobOf("2", spread, 24)], "part-1", everyCase(1.1));
    expect(held).toBeGreaterThan(1.2);
  });
});

describe("caseLimits", () => {
  it("gives each case the limit of its own noise, and all cases pass together at these limits", () => {
    const noisy = (name: string): number => (name === "part-1" ? 1.2 : 1.02);
    const jobs = [jobOf("1", noisy, 24), jobOf("2", noisy, 24)];
    const limits = caseLimits(jobs);
    expect(limits["part-1"]).toBeGreaterThan(1.2);
    expect(limits["part-1"]).toBeLessThan(1.21);
    expect(limits["first-1"]).toBeLessThan(1.03);
    expect(outcomeAtCaseLimits(jobs, limits)).toBe("pass");
  });

  it("gives limits that pass together when a case passes the first look alone only at the level of the whole family", () => {
    // 10 of 12 below 1.02 at the first look, 18 of 24 at the second: alone at the level of the family this passes at 1.02, and together this has no outcome at 1.02
    const late = (_name: string, round: number): number => (round < 12 ? (round % 6 === 0 ? 1.15 : 1.02) : round % 3 === 0 ? 1.15 : 1.02);
    const jobs = [jobOf("1", late, 24), jobOf("2", late, 24)];
    expect(outcomeAtCaseLimits(jobs, everyCase(1.03), ["one-10"])).toBe("no read");
    const limits = caseLimits(jobs, ["one-10"]);
    expect(limits["first-1"]).toBeGreaterThan(1.15);
    expect(outcomeAtCaseLimits(jobs, limits, ["one-10"])).toBe("pass");
  });

  it("reads a slower case as a block at a limit below its ratio", () => {
    const noisy = (name: string): number => (name === "part-1" ? 1.2 : 1.02);
    const jobs = [jobOf("1", noisy, 24), jobOf("2", noisy, 24)];
    expect(outcomeAtCaseLimits(jobs, { ...caseLimits(jobs), "part-1": 1.1 })).toBe("block");
  });
});

describe("shortOfLastLook", () => {
  it("names each case of a job that stops at the first look", () => {
    const short = shortOfLastLook([jobOf("1", same, 12), jobOf("2", same, 24)]);
    expect(short).toHaveLength(CASES.length);
    expect(short[0]).toBe(`job 1, ${CASES[0]}: 12 of 24 rounds`);
  });

  it("names nothing when each job reaches the last look", () => {
    expect(shortOfLastLook([jobOf("1", same, 24), jobOf("2", same, 24)])).toEqual([]);
  });
});

describe("rerunCounts", () => {
  it("counts a rerun after a no read, and keeps a pass that follows it apart", () => {
    const counts = rerunCounts([
      { pr: "1", run: "a", attempt: 1, outcome: "no read" },
      { pr: "1", run: "a", attempt: 2, outcome: "no read" },
      { pr: "1", run: "a", attempt: 3, outcome: "pass" },
      { pr: "2", run: "b", attempt: 1, outcome: "pass" },
      { pr: "2", run: "b", attempt: 2, outcome: "pass" },
    ]);
    expect(counts).toEqual([
      { pr: "1", noReads: 2, rerunsAfterNoRead: 2, passesAfterNoRead: 1 },
      { pr: "2", noReads: 0, rerunsAfterNoRead: 0, passesAfterNoRead: 0 },
    ]);
  });
});
