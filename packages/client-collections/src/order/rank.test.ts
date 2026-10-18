import { describe, expect, it } from "vitest";
import { dropIndex, rankBetween } from "../index.js";

describe("rankBetween", () => {
  it("gives a rank between two neighbors, or before or after one", () => {
    expect(rankBetween(undefined, undefined)).toBe(0);
    expect(rankBetween(undefined, 4)).toBe(3);
    expect(rankBetween(4, undefined)).toBe(5);
    expect(rankBetween(1, 2)).toBe(1.5);
  });

  it("keeps a rank strictly between its neighbors after many moves to the same gap", () => {
    let next = 1;
    for (let i = 0; i < 40; i++) {
      const rank = rankBetween(0, next);
      expect(rank).toBeGreaterThan(0);
      expect(rank).toBeLessThan(next);
      next = rank;
    }
  });
});

describe("dropIndex", () => {
  it("reads the rows from top to bottom, then each row from left to right", () => {
    const grid = [{ x: 50, y: 50 }, { x: 150, y: 50 }, { x: 50, y: 150 }];
    expect(dropIndex({ x: 10, y: 50 }, grid)).toBe(0);
    expect(dropIndex({ x: 100, y: 55 }, grid)).toBe(1);
    expect(dropIndex({ x: 200, y: 50 }, grid)).toBe(2);
    expect(dropIndex({ x: 10, y: 100 }, grid)).toBe(2);
    expect(dropIndex({ x: 10, y: 400 }, grid)).toBe(3);
  });

  it("gives 0 for no items, and takes the row tolerance", () => {
    expect(dropIndex({ x: 0, y: 0 }, [])).toBe(0);
    expect(dropIndex({ x: 10, y: 20 }, [{ x: 50, y: 50 }])).toBe(0);
    expect(dropIndex({ x: 10, y: 20 }, [{ x: 50, y: 50 }], 40)).toBe(0);
    expect(dropIndex({ x: 60, y: 20 }, [{ x: 50, y: 50 }], 40)).toBe(1);
  });
});
