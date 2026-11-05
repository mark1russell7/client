import { schedule, spike } from "@mark1russell7/rigor-chaos";
import { describe, expect, it } from "vitest";
import { BURST_AT_MS, BURST_MS, FIRST_LOAD_ORDER, FIRST_LOAD_SPLIT, FIRST_LOAD_WRITES, WINDOW_MS, firstLoadCollection, firstLoadOf, parseTenantCase } from "./tenant-cases.js";
import { planOf } from "./tenant-plan.js";

/** This function gives the writes of the first loads in one plan of a case. */
function loadWrites(id: string, seed: string): { load: number; collection: number }[] {
  const kase = parseTenantCase(id);
  return planOf(id, seed).times.flatMap((planned, index) => {
    const write = firstLoadOf(kase, index, planned);
    return write ? [write] : [];
  });
}

describe("the first loads of the tenant bench", () => {
  it("reads a case with first loads, and a case without has none", () => {
    expect(parseTenantCase("200-p2-first10")).toMatchObject({ rate: 200, processes: 2, firstLoads: 10, burst: false, apart: false, tmpfs: false });
    expect(parseTenantCase("200-p2").firstLoads).toBe(0);
    expect(parseTenantCase("400-p2-hot")).toMatchObject({ rate: 400, processes: 2, hot: true, active: 1 });
    expect(parseTenantCase("400-p2").hot).toBe(false);
    expect(firstLoadOf(parseTenantCase("200-p2"), 1_000, BURST_AT_MS)).toBeNull();
  });

  it("gives each collection a turn in the measured share", () => {
    const seen = FIRST_LOAD_SPLIT.map((_, collection) => FIRST_LOAD_ORDER.filter((entry) => entry === collection).length);
    expect(seen).toEqual([...FIRST_LOAD_SPLIT]);
    // The first 72 turns of the order reach each of the 11 collections
    expect(new Set(FIRST_LOAD_ORDER.slice(0, FIRST_LOAD_WRITES)).size).toBe(FIRST_LOAD_SPLIT.length);
  });

  it("puts the writes of a first load only in the second of the burst", () => {
    const kase = parseTenantCase("200-p2-first1");
    for (let index = 0; index < 500; index++) {
      expect(firstLoadOf(kase, index, BURST_AT_MS - 1)).toBeNull();
      expect(firstLoadOf(kase, index, BURST_AT_MS + BURST_MS)).toBeNull();
    }
    expect(Array.from({ length: 500 }, (_, index) => firstLoadOf(kase, index, BURST_AT_MS)).some((write) => write !== null)).toBe(true);
  });

  it("sends about the stated writes of each first load in a plan, near the spread of a Poisson count", () => {
    for (const [id, loads] of [["20-p2-first1", 1], ["200-p2-first1", 1], ["200-p2-first10", 10]] as const) {
      const counts = Array.from({ length: 50 }, (_, seed) => loadWrites(id, String(seed)).length);
      const mean = counts.reduce((sum, count) => sum + count, 0) / counts.length;
      const stated = loads * FIRST_LOAD_WRITES;
      // The mean of 50 Poisson counts has a spread near 1.5 %, so 10 % is far outside a fault of chance
      expect(Math.abs(mean - stated) / stated).toBeLessThan(0.1);
      expect(new Set(loadWrites(id, "0").map((write) => write.load)).size).toBe(loads);
    }
  });

  it("names the 10 collections of a first load, and the last entry is the collection of the steady load", () => {
    expect(firstLoadCollection("store", { load: 3, collection: 0 })).toBe("load0");
    expect(firstLoadCollection("control", { load: 3, collection: 0 })).toBe("load0");
    expect(firstLoadCollection("store", { load: 3, collection: FIRST_LOAD_SPLIT.length - 1 })).toBe("docs");
    expect(firstLoadCollection("control", { load: 3, collection: FIRST_LOAD_SPLIT.length - 1 })).toBe("docs3");
  });

  it("adds the writes to the steady rate only in the second of the burst", () => {
    const times = planOf("20-p2-first10", "0").times;
    const inBurst = times.filter((time) => time >= BURST_AT_MS && time < BURST_AT_MS + BURST_MS).length;
    const steady = schedule(spike(20, 20, { before: BURST_AT_MS, width: BURST_MS, after: WINDOW_MS - BURST_AT_MS - BURST_MS }), { arrivals: "poisson", seed: "0" }).times.length;
    expect(inBurst).toBeGreaterThan(600);
    expect(times.length - inBurst).toBeLessThan(steady * 1.2);
  });
});
