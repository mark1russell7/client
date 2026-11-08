import { firstArm } from "@mark1russell7/rigor-bench";
import { describe, expect, it } from "vitest";
import { pairedRecords, pairedSchedule, timesOfPairs, type PairedStep } from "./write-paired.js";

const short = (order: readonly PairedStep[]): string => order.map((step) => `${step.pair === "aa" ? "aa." : ""}${step.label}`).join(" ");

describe("pairedSchedule", () => {
  it("sends each pair in the order A B B A, and the first arm comes from firstArm", () => {
    expect(firstArm(0, 0)).toBe("a");
    expect(short(pairedSchedule(0, 0, 1))).toBe("before after after before aa.before aa.copy aa.copy aa.before");
    expect(firstArm(1, 0)).toBe("b");
    expect(short(pairedSchedule(1, 0, 1))).toBe("aa.copy aa.before aa.before aa.copy after before before after");
  });

  it("changes the places of the two blocks at each step", () => {
    const order = pairedSchedule(0, 0, 2);
    expect(order.slice(0, 4).every((step) => step.pair === "candidate")).toBe(true);
    expect(order.slice(8, 12).every((step) => step.pair === "aa")).toBe(true);
  });

  it("gives each source of a pair the same count of bursts, and each one starts first half of the time over two rounds", () => {
    for (const caseIndex of [0, 1, 2]) {
      const both = [...pairedSchedule(4, caseIndex, 8), ...pairedSchedule(5, caseIndex, 8)];
      const count = (pair: string, label: string): number => both.filter((step) => step.pair === pair && step.label === label).length;
      expect([count("candidate", "before"), count("candidate", "after"), count("aa", "before"), count("aa", "copy")]).toEqual([32, 32, 32, 32]);
      const firstOfBlock = both.filter((_, index) => index % 4 === 0);
      expect(firstOfBlock.filter((step) => step.label === "before").length).toBe(firstOfBlock.length / 2);
    }
  });

  it("refuses a count of steps under 1 or not whole", () => {
    expect(() => pairedSchedule(0, 0, 0)).toThrow(RangeError);
    expect(() => pairedSchedule(0, 0, 1.5)).toThrow(RangeError);
  });
});

describe("pairedRecords", () => {
  it("gives each arm the median of its bursts in its pair", () => {
    const order = pairedSchedule(0, 0, 2);
    // A time for each source: before 10 + n, after 20 + n, copy 30 + n, where n counts the bursts of the source
    const seen: Record<string, number> = {};
    const times = order.map((step) => {
      const key = `${step.pair}.${step.label}`;
      seen[key] = (seen[key] ?? 0) + 1;
      return { before: 10, after: 20, copy: 30 }[step.label] + (seen[key] ?? 0);
    });
    expect(timesOfPairs(order, times).candidate.after).toEqual([21, 22, 23, 24]);
    expect(pairedRecords("one-10", 0, 0, order, times)).toEqual({
      candidate: { case: "one-10", round: 0, first: "a", a: 12.5, b: 22.5 },
      aa: { case: "one-10", round: 0, first: "a", a: 12.5, b: 32.5 },
    });
  });

  it("refuses a count of times that is not the count of bursts", () => {
    expect(() => pairedRecords("one-10", 0, 0, pairedSchedule(0, 0, 1), [1, 2])).toThrow(RangeError);
  });
});
