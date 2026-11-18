import { describe, expect, it } from "vitest";
import { DEFAULT_WRITES_IN_FLIGHT } from "../src/storage/document-storage.js";
import { BOUND_LIMIT, keptUp, plannedSets, writersOf } from "./live-cases.js";

describe("the cases of the live state bench", () => {
  it("reads the number of writers of a case", () => {
    expect(writersOf("w1")).toBe(1);
    expect(writersOf("w100")).toBe(100);
    for (const name of ["w0", "w", "100", "w1x"]) expect(() => writersOf(name)).toThrow(RangeError);
  });

  it("plans 8 sets a second for each writer over 20 seconds", () => {
    expect(plannedSets(1)).toBe(160);
    expect(plannedSets(100)).toBe(16_000);
  });

  it("keeps up only with 95 % of the replies, no failure and a reader p99 of at most 1,000 ms", () => {
    const pass = { planned: 100, replied: 95, failures: 0, readerP99Ms: 1000 };
    expect(keptUp(pass)).toBe(true);
    expect(keptUp({ ...pass, replied: 94 })).toBe(false);
    expect(keptUp({ ...pass, failures: 1 })).toBe(false);
    expect(keptUp({ ...pass, readerP99Ms: 1000.5 })).toBe(false);
  });

  it("bounds more writes than the write queue runs at one time, so the queue keeps writes that wait", () => {
    expect(Number.isInteger(BOUND_LIMIT)).toBe(true);
    expect(BOUND_LIMIT).toBeGreaterThan(DEFAULT_WRITES_IN_FLIGHT);
  });
});
