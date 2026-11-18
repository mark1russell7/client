import type { ChildFields } from "@mark1russell7/rigor-bench/fresh";
import { describe, expect, it } from "vitest";
import { blockLessGc, childGc } from "./fan-out-gc.js";

/** This function gives the fields of one child with these GC reads. */
function fields(events: ChildFields["events"]): ChildFields {
  return events === undefined ? {} : { events };
}

describe("the GC reads of one child of the fan-out bench", () => {
  it("adds the GC time of both halves and takes the longest event of both halves", () => {
    expect(childGc(fields({ gc: [3, 2], gcMs: [12.5, 4], gcMaxMs: [6, 3] }))).toEqual({ sumMs: 16.5, maxMs: 6 });
    expect(childGc(fields({ gc: [1, 4], gcMs: [2, 30], gcMaxMs: [2, 11] }))).toEqual({ sumMs: 32, maxMs: 11 });
  });

  it("gives no longest event for a line of an older probe, and no reads for a child with no GC time", () => {
    expect(childGc(fields({ gc: [3, 2], gcMs: [12.5, 4] }))).toEqual({ sumMs: 16.5 });
    expect(childGc(fields(undefined))).toBeUndefined();
    expect(childGc(undefined)).toBeUndefined();
  });

  it("gives the block less the longest GC event, and nothing when the child has no longest event", () => {
    const child = fields({ gc: [3, 2], gcMs: [12.5, 4], gcMaxMs: [6, 3] });
    expect(blockLessGc(9.5, child)).toBe(3.5);
    // One GC event that is longer than the block explains it
    expect(blockLessGc(4, child)).toBe(-2);
    expect(blockLessGc(9.5, fields({ gc: [3, 2], gcMs: [12.5, 4] }))).toBeUndefined();
    expect(blockLessGc(9.5, undefined)).toBeUndefined();
  });
});
