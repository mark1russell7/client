import type { PairedTime } from "@mark1russell7/rigor-bench";
import { describe, expect, it } from "vitest";
import { MAX_GROWTH, MIN_JOBS, fanOutGrowth, growthRounds, type GrowthJob } from "./fan-out-growth.js";

const SIZES = [1_000, 10_000, 100_000] as const;
const FIVE = ["1", "2", "3", "4", "5"];

/** This function gives one job whose times grow `plain` and `sliced` times for each 10 times more subscribers. */
function job(name: string, growth: { plain: number; sliced: number }, measures: readonly ("block" | "total")[] = ["block", "total"]): GrowthJob {
  const candidate: PairedTime[] = measures.flatMap((measure) =>
    SIZES.flatMap((size, step) =>
      Array.from({ length: 6 }, (_, round) => ({
        case: `${measure}-${size}`,
        round,
        first: round % 2 === 0 ? ("a" as const) : ("b" as const),
        a: 4 * growth.plain ** step * (1 + round / 100),
        b: 4 * growth.sliced ** step * (1 + round / 100),
      })),
    ),
  );
  return { job: name, candidate };
}

describe("the growth gate of the fan-out bench", () => {
  it("passes a growth of 13 times for each 10 times more subscribers", () => {
    const growth = fanOutGrowth(FIVE.map((name) => job(name, { plain: 13, sliced: 11.5 })));
    expect(growth.outcome).toBe("pass");
    expect(growth.reason).toBeUndefined();
    expect(growth.cases).toEqual([]);
    expect(growth.gate?.plain.steps.map((step) => Math.round(step.median))).toEqual([13, 13]);
  });

  it("blocks the cost of n x n: 100 times for each 10 times more subscribers", () => {
    const growth = fanOutGrowth(FIVE.map((name) => job(name, { plain: 100, sliced: 11.5 })));
    expect(growth.outcome).toBe("block");
    expect(growth.reason).toContain("the time of a publish grows too fast: plain 1000 to 10000: 100.0x");
    expect(growth.reason).toContain(`limit ${MAX_GROWTH}x`);
    expect(growth.cases).toEqual(["total-1000", "total-10000", "total-100000"]);
  });

  it("blocks a case total whose child did not end in its time limit, and names the case, the arm and the job", () => {
    const late = (name: string): GrowthJob => {
      const { candidate } = job(name, { plain: 100, sliced: 11.5 });
      return { job: name, candidate: candidate.filter((record) => record.case !== "total-100000"), skipped: [{ arm: "plain", case: "total-100000", reason: "took more than 120000 ms" }] };
    };
    const growth = fanOutGrowth(FIVE.map(late));
    expect(growth.outcome).toBe("block");
    expect(growth.reason).toContain("a publish did not end in time: total-100000 (arm plain, job 1): took more than 120000 ms");
    expect(growth.reason).toContain("(arm plain, job 5)");
    expect(growth.cases).toEqual(["total-100000"]);
  });

  it("blocks a late case total in one job, when the other jobs pass", () => {
    const jobs = FIVE.map((name) => job(name, { plain: 13, sliced: 11.5 }));
    const growth = fanOutGrowth([...jobs.slice(0, 4), { ...jobs[4]!, skipped: [{ arm: "sliced", case: "total-100000", reason: "took more than 120000 ms" }] }]);
    expect(growth.outcome).toBe("block");
    expect(growth.reason).toBe("a publish did not end in time: total-100000 (arm sliced, job 5): took more than 120000 ms");
  });

  it("gives no read for a skip of a case total with another reason", () => {
    const jobs = FIVE.map((name) => job(name, { plain: 13, sliced: 11.5 }));
    const growth = fanOutGrowth([{ ...jobs[0]!, skipped: [{ arm: "plain", case: "total-10000", reason: "too large" }] }, ...jobs.slice(1)]);
    expect(growth.outcome).toBe("no read");
    expect(growth.reason).toBe("the jobs skipped a case of the gate: total-10000 (arm plain, job 1): too large");
    expect(growth.cases).toEqual(["total-10000"]);
  });

  it("passes when only a case block did not end in time, because the block is a report", () => {
    const jobs = FIVE.map((name) => job(name, { plain: 13, sliced: 11.5 }));
    const growth = fanOutGrowth(jobs.map((one) => ({ ...one, skipped: [{ arm: "plain", case: "block-100000", reason: "took more than 120000 ms" }] })));
    expect(growth.outcome).toBe("pass");
  });

  it("gives no read when the jobs fall on both sides of the limit", () => {
    const growth = fanOutGrowth([job("1", { plain: 12, sliced: 11 }), job("2", { plain: 19, sliced: 11 }), job("3", { plain: 13, sliced: 11 }), job("4", { plain: 13, sliced: 11 }), job("5", { plain: 12, sliced: 11 })]);
    expect(growth.outcome).toBe("no read");
    expect(growth.reason).toContain("the interval crosses the limit");
  });

  it("gives no read for fewer than 5 jobs, also when each job is within the limit", () => {
    const growth = fanOutGrowth(["1", "2", "3"].map((name) => job(name, { plain: 13, sliced: 11.5 }, ["total"])));
    expect(MIN_JOBS).toBe(5);
    expect(growth.outcome).toBe("no read");
    expect(growth.reason).toBe("the gate needs 5 jobs or more, and the run has 3");
  });

  it("gates the run of a pull request, which times only the case total", () => {
    const growth = fanOutGrowth(FIVE.map((name) => job(name, { plain: 13, sliced: 11.5 }, ["total"])));
    expect(growth.outcome).toBe("pass");
    expect(growth.report).toBeUndefined();
  });

  it("gives no read, and does not pass, when the jobs have no case total", () => {
    const growth = fanOutGrowth(FIVE.map((name) => job(name, { plain: 13, sliced: 11.5 }, ["block"])));
    expect(growth.outcome).toBe("no read");
    expect(growth.reason).toBe("the jobs time the case total at fewer than 2 sizes");
    expect(growth.report?.plain.outcome).toBe("within");
  });

  it("reads the arm plain from the side a and the arm sliced from the side b", () => {
    const one = job("1", { plain: 13, sliced: 2 }, ["total"]);
    expect(growthRounds([one], "total", "plain").filter((round) => round.size === 10_000)[0]?.value).toBeCloseTo(52);
    expect(growthRounds([one], "total", "sliced").filter((round) => round.size === 10_000)[0]?.value).toBeCloseTo(8);
    expect(growthRounds([one], "block", "plain")).toEqual([]);
  });
});
