import { describe, expect, it } from "vitest";
import { spreadOf, type SpreadWrite } from "./tenant-spread.js";

/** This function gives the writes of a run with `keys` keys, `each` writes per key and two processes. */
function writes(keys: number, each: number, msOf: (key: number) => number, replied: (key: number) => boolean = () => true): SpreadWrite[] {
  return Array.from({ length: keys * each }, (_, index) => {
    const key = index % keys;
    return { key, process: index % 2, ms: msOf(key), replied: replied(key) };
  });
}

describe("the spread of a tenant run over its keys and processes (CLI-96)", () => {
  it("gives an even spread for an even run", () => {
    const spread = spreadOf(writes(200, 4, () => 10), 2);
    expect(spread.keys).toBe(200);
    expect(spread.plannedPerKey).toEqual({ min: 4, max: 4 });
    expect(spread.repliesPerKey).toEqual({ p01: 4, median: 4, p99: 4, max: 4 });
    expect(spread.topShare).toBe(0.01);
    expect(spread.keyMedianMs).toEqual({ median: 10, p99: 10, max: 10 });
    expect(spread.processReplies).toEqual([400, 400]);
  });

  it("shows a hot key: its replies, its share and its time", () => {
    const hot = writes(200, 4, (key) => (key === 7 ? 900 : 10), (key) => key === 7);
    const spread = spreadOf(hot, 2);
    expect(spread.repliesPerKey.max).toBe(4);
    expect(spread.repliesPerKey.median).toBe(0);
    expect(spread.topShare).toBe(1);
    expect(spread.keyMedianMs.max).toBe(900);
    expect(spread.keyMedianMs.median).toBe(10);
  });

  it("shows a process that holds the run", () => {
    const run = writes(100, 4, () => 10).map((write) => ({ ...write, replied: write.process === 0 }));
    expect(spreadOf(run, 2).processReplies).toEqual([200, 0]);
  });

  it("gives zeros for a run with no writes", () => {
    expect(spreadOf([], 2)).toEqual({ keys: 0, plannedPerKey: { min: 0, max: 0 }, repliesPerKey: { p01: 0, median: 0, p99: 0, max: 0 }, topShare: 0, keyMedianMs: { median: 0, p99: 0, max: 0 }, processReplies: [0, 0] });
  });
});
