import { runLimit, type PairedTime } from "@mark1russell7/rigor-bench";
import { describe, expect, it } from "vitest";
import { BLOCK_BUDGET, BLOCK_MEDIANS, BUDGET_RUNS, MIN_CHILDREN, blockBudget } from "./fan-out-budget.js";
import type { GrowthJob } from "./fan-out-growth.js";

const FIVE = ["1", "2", "3", "4", "5"];
const EPYC = "AMD EPYC 7763 64-Core Processor";

/** This function gives one job whose sliced block of each size is `block[size]` and grows a little with each round. A CPU of null gives a job with no computer. */
function job(name: string, block: Readonly<Record<number, number>>, cpu: string | null = EPYC, rounds = 6): GrowthJob {
  const candidate: PairedTime[] = Object.entries(block).flatMap(([size, ms]) =>
    Array.from({ length: rounds }, (_, round) => ({
      case: `block-${size}`,
      round,
      first: round % 2 === 0 ? ("a" as const) : ("b" as const),
      a: 10 * ms,
      b: ms * (1 + round / 100),
    })),
  );
  return { job: name, candidate, ...(cpu !== null && { env: { cpu } }) };
}

/** The blocks of a run of the code of today: near the medians of the runs of the budget. */
const TODAY = { 1_000: 3.7, 10_000: 8.9, 100_000: 92 };

describe("the block budget of the fan-out bench", () => {
  it("gives each budget from the medians of 6 runs: the worst median plus the spread, rounded up", () => {
    expect(BUDGET_RUNS).toHaveLength(6);
    expect(BLOCK_BUDGET).toEqual({ 1_000: 5, 10_000: 11, 100_000: 97 });
    for (const [size, medians] of Object.entries(BLOCK_MEDIANS)) {
      expect(medians).toHaveLength(BUDGET_RUNS.length);
      expect(BLOCK_BUDGET[Number(size)]).toBe(runLimit(medians, { digits: 0 }).limit);
      // Each run of the budget is within its budget
      for (const value of medians) expect(value).toBeLessThanOrEqual(BLOCK_BUDGET[Number(size)]!);
    }
  });

  it("passes the blocks of the code of today, and gives the median of each size", () => {
    const budget = blockBudget(FIVE.map((name) => job(name, TODAY)));
    expect(budget.outcome).toBe("pass");
    expect(budget.reason).toBeUndefined();
    expect(budget.uncovered).toEqual([]);
    expect(budget.sizes.map((size) => [size.case, size.children, size.outcome])).toEqual([
      ["block-1000", 30, "within"],
      ["block-10000", 30, "within"],
      ["block-100000", 30, "within"],
    ]);
    expect(budget.sizes[2]!.median).toBeCloseTo(92 * 1.025, 9);
  });

  it("blocks a sliced block past the budget, and names the size", () => {
    const budget = blockBudget(FIVE.map((name) => job(name, { ...TODAY, 100_000: 120 })));
    expect(budget.outcome).toBe("block");
    expect(budget.reason).toBe("the sliced block goes past the budget: block-100000: 123.0 ms, budget 97 ms");
    expect(budget.sizes.filter((size) => size.outcome === "beyond").map((size) => size.case)).toEqual(["block-100000"]);
  });

  it("reads the budget for the arm sliced only", () => {
    // The arm plain blocks 10 times longer than the arm sliced in the fixture, and the budget does not read it
    expect(blockBudget(FIVE.map((name) => job(name, TODAY))).sizes.every((size) => size.median! < size.limit)).toBe(true);
  });

  it("gives no read for a block past the budget when a job ran on a CPU model outside the runs of the budget", () => {
    const jobs = FIVE.map((name) => job(name, { ...TODAY, 100_000: 120 }, name === "3" ? "AMD EPYC 9V84 96-Core Processor" : EPYC));
    const budget = blockBudget(jobs);
    expect(budget.outcome).toBe("no read");
    expect(budget.uncovered).toEqual(["AMD EPYC 9V84 96-Core Processor"]);
    expect(budget.reason).toContain("jobs ran on CPU models outside the runs of the budget: AMD EPYC 9V84 96-Core Processor");
  });

  it("reads the CPU models of the budget in any case of the letters, and names a job with no CPU name", () => {
    const models = ["AMD EPYC 9V74 80-Core Processor", "INTEL(R) XEON(R) PLATINUM 8573C", "Intel(R) Xeon(R) 6975P-C", "amd epyc 9v45 96-core processor", EPYC];
    expect(blockBudget(FIVE.map((name, index) => job(name, TODAY, models[index]))).uncovered).toEqual([]);
    expect(blockBudget(FIVE.map((name) => job(name, TODAY, name === "1" ? null : EPYC))).uncovered).toEqual(["unknown"]);
  });

  it("tells that the jobs time no case block, as in the run of a pull request", () => {
    const total: GrowthJob = { job: "1", candidate: [{ case: "total-1000", round: 0, first: "a", a: 50, b: 60 }] };
    const budget = blockBudget([total]);
    expect(budget.outcome).toBe("not timed");
    expect(budget.sizes).toEqual([]);
  });

  it("gives no read for fewer than 5 jobs, fewer children than the runs of the budget, or a skip of a case of the budget", () => {
    const four = blockBudget(FIVE.slice(0, 4).map((name) => job(name, TODAY)));
    expect(four.outcome).toBe("no read");
    expect(four.reason).toBe("the budget needs 5 jobs or more, and the run has 4");

    const short = blockBudget(FIVE.map((name) => job(name, TODAY, EPYC, 3)));
    expect(short.outcome).toBe("no read");
    expect(short.reason).toBe(`the budget needs ${MIN_CHILDREN} children at each size: block-1000 has 15, block-10000 has 15, block-100000 has 15`);

    const jobs = FIVE.map((name) => job(name, TODAY));
    const skipped = blockBudget([...jobs.slice(0, 4), { ...jobs[4]!, skipped: [{ arm: "sliced", case: "block-100000", reason: "took more than 120000 ms" }] }]);
    expect(skipped.outcome).toBe("no read");
    expect(skipped.reason).toBe("the jobs skipped a case of the budget: block-100000 (arm sliced, job 5): took more than 120000 ms");
    expect(skipped.sizes.find((size) => size.case === "block-100000")?.outcome).toBe("no read");
  });

  it("gives no read for a missing size, and does not pass it", () => {
    const budget = blockBudget(FIVE.map((name) => job(name, { 1_000: 3.7, 10_000: 8.9 })));
    expect(budget.outcome).toBe("no read");
    expect(budget.reason).toContain("block-100000 has 0");
  });
});
