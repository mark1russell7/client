import type { Db } from "mongodb";
import { describe, expect, it } from "vitest";
import { CHANGE_READ_DIVISOR, poolShare } from "./pool-share.js";

const dbWithPool = (maxPoolSize?: number): Db => ({ client: { options: { maxPoolSize } } }) as unknown as Db;

describe("poolShare", () => {
  it("gives 8 change reads at the default pool of 100, and scales with the pool", () => {
    expect(poolShare(dbWithPool(100), CHANGE_READ_DIVISOR)).toBe(8);
    expect(poolShare(dbWithPool(240), CHANGE_READ_DIVISOR)).toBe(20);
    expect(poolShare(dbWithPool(10), CHANGE_READ_DIVISOR)).toBe(1);
  });

  it("uses the default pool for a fake database with no client and for a pool of 0", () => {
    expect(poolShare({} as Db, CHANGE_READ_DIVISOR)).toBe(8);
    expect(poolShare(dbWithPool(0), CHANGE_READ_DIVISOR)).toBe(8);
  });

  it("keeps the passes of the materializer at one third of the pool, at most 32", () => {
    expect(poolShare(dbWithPool(100), 3, 32)).toBe(32);
    expect(poolShare(dbWithPool(30), 3, 32)).toBe(10);
    expect(poolShare(dbWithPool(2), 3, 32)).toBe(1);
  });
});
