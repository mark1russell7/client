/** The tests of the verdict of the speed gate of the store (roadmap CLI-94). The rounds are data, so the tests do not depend on the computer. */

import { describe, expect, it } from "vitest";
import type { JobRecords, PairedTime } from "@mark1russell7/rigor-bench";
import { BLOCK_EXIT, NO_READ_EXIT, READ_CASES, WRITE_CASES, joinJobs, passingLimit, storeGate } from "./gate-verdict.js";

const CASES = [...READ_CASES, ...WRITE_CASES];
const LIMIT = 1.1;
const INPUT = { limit: LIMIT, failures: 0, attempt: 1 };

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
    expect(storeGate(jobs, { ...INPUT, limit }).outcome).toBe("pass");
    expect(storeGate(jobs, { ...INPUT, limit: 1.04 }).outcome).toBe("block");
  });

  it("gives no finite limit when a job misses a case", () => {
    expect(passingLimit([jobOf("1", same)])).toBe(Number.POSITIVE_INFINITY);
  });
});
