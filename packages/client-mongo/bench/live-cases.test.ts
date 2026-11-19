import { describe, expect, it } from "vitest";
import { DEFAULT_WRITES_IN_FLIGHT } from "../src/storage/document-storage.js";
import { BOUND_LIMIT, keptUp, plannedSets, replyRate, writersOf } from "./live-cases.js";

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

  it("gives the replies for each second from the start of the load to the last reply", () => {
    // Without a bound, the queue replies in the grace too: 6,900 replies in 23 seconds
    expect(replyRate({ replied: 6900, lastReplyMs: 23_000 })).toBe(300);
    // With a bound, the replies end soon after the load: 6,060 replies in 20.2 seconds
    expect(replyRate({ replied: 6060, lastReplyMs: 20_200 })).toBeCloseTo(300, 9);
    expect(replyRate({ replied: 0, lastReplyMs: null })).toBeNull();
    expect(replyRate({ replied: 10 })).toBeNull();
    expect(replyRate({ replied: 1, lastReplyMs: 0 })).toBeNull();
    expect(replyRate({ replied: 1, lastReplyMs: Number.NaN })).toBeNull();
  });

  it("bounds more writes than the write queue runs at one time, so the queue keeps writes that wait", () => {
    expect(Number.isInteger(BOUND_LIMIT)).toBe(true);
    expect(BOUND_LIMIT).toBeGreaterThan(DEFAULT_WRITES_IN_FLIGHT);
  });
});
