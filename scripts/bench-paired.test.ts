// The tests of scripts/bench-paired.ts and scripts/bench-paired-child.ts (O83): the round ratios,
// the A/A rule, the interval rule and the verdicts, with times in memory. No test times code.
// Start them with: node --test scripts/bench-paired.test.ts

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { aggregateVerdict, analyzeInput, bandOf, containsOne, effectOf, halfSpreadOf, roundRatios, runMarkdown, spreadOf, verdictMarkdown, verdictOf, verdictsOf, type Analysis, type Sample } from "./bench-paired.ts";
import { CORE, COLD_CALLS, WARM, WORKLOADS, isStable, pass, timeSetup, timeWarm, timeWorkload, type Workload } from "./bench-paired-child.ts";
import { quantileOf } from "./lib/paired-time.ts";

/** This function makes one input of a paired-time/1 report from the times of each round. */
function input(id: string, base: number[], head: number[], aa: number[]) {
  const ms = { base, head, "base~aa": aa };
  const median = { base: quantileOf(base, 0.5), head: quantileOf(head, 0.5), "base~aa": quantileOf(aa, 0.5) };
  return { id, ms, median, ratio: { head: median.head / median.base, "base~aa": median["base~aa"] / median.base } };
}

/** The base times of 6 rounds, and an A/A arm whose round ratios are 0.99 to 1.01. */
const BASE = [1, 1, 1, 1, 1, 1];
const AA = [0.99, 1.01, 1, 0.995, 1.005, 1];

/** This function makes the analysis of a benchmark in one run, for the aggregate. */
const sample = (run: string, ratio: number, options: Partial<{ counts: boolean; spread: number }> = {}): Sample => ({
  run,
  // Only the fields that the aggregate reads
  analysis: { id: "x", ratio, baseMs: 1, headMs: ratio, counts: options.counts ?? true, aa: { spread: options.spread ?? 0.01, band: { p10: 1 - (options.spread ?? 0.01), median: 1, p90: 1 + (options.spread ?? 0.01) } } } as Analysis,
});

describe("roundRatios", () => {
  it("gives the ratio of each round, and skips a round with a base time of 0", () => {
    assert.deepEqual(roundRatios([2, 3, 4], [1, 0, 2]), [2, 2]);
    assert.deepEqual(roundRatios([2, 3], [1]), [2]);
  });
});

describe("the A/A rule and the interval rule", () => {
  it("tells if a band contains 1.0", () => {
    assert.equal(containsOne({ p10: 0.98, p90: 1.02 }), true);
    assert.equal(containsOne({ p10: 1, p90: 1 }), true);
    assert.equal(containsOne({ p10: 1.01, p90: 1.05 }), false);
    assert.equal(containsOne({ p10: 0.9, p90: 0.99 }), false);
    assert.equal(containsOne({ p10: Number.NaN, p90: Number.NaN }), false);
  });

  it("gives the spread as the largest distance of a bound from 1.0", () => {
    assert.ok(Math.abs(spreadOf({ p10: 0.97, p90: 1.02 }) - 0.03) < 1e-12);
    assert.ok(Math.abs(spreadOf({ p10: 0.99, p90: 1.05 }) - 0.05) < 1e-12);
    assert.ok(Math.abs(spreadOf({ p10: 1.01, p90: 1.02 }) - 0.02) < 1e-12);
  });

  it("gives the half-spread as half of the distance from p10 to p90", () => {
    assert.ok(Math.abs(halfSpreadOf({ p10: 0.94, p90: 1.06 }) - 0.06) < 1e-12);
    assert.ok(Math.abs(halfSpreadOf({ p10: 0.99, p90: 1.05 }) - 0.03) < 1e-12);
  });

  it("gives the effect interval: the lowest and the highest ratio, widened by the half-spread", () => {
    const e = effectOf([3.64, 3.7, 3.84], 0.06);
    assert.ok(Math.abs(e.lo - 3.58) < 1e-12);
    assert.ok(Math.abs(e.hi - 3.9) < 1e-12);
    assert.ok(Number.isNaN(effectOf([], 0.06).lo));
  });

  it("gives slower or faster when the interval is outside 1 ± budget", () => {
    assert.equal(verdictOf({ lo: 1.11, hi: 4 }, 0.1), "slower");
    assert.equal(verdictOf({ lo: 0.5, hi: 0.89 }, 0.1), "faster");
  });

  it("gives no change only when the interval is inside 1 ± budget", () => {
    assert.equal(verdictOf({ lo: 0.9, hi: 1.1 }, 0.1), "no change");
    assert.equal(verdictOf({ lo: 0.95, hi: 1.02 }, 0.1), "no change");
  });

  it("cannot decide when the interval crosses a bound of 1 ± budget", () => {
    assert.equal(verdictOf({ lo: 1.05, hi: 1.2 }, 0.1), "cannot decide");
    assert.equal(verdictOf({ lo: 0.88, hi: 1.12 }, 0.1), "cannot decide");
    assert.equal(verdictOf({ lo: 0.85, hi: 0.95 }, 0.1), "cannot decide");
    assert.equal(verdictOf({ lo: Number.NaN, hi: Number.NaN }, 0.1), "cannot decide");
  });

  it("gives the band of a list: p10, the median and p90", () => {
    assert.deepEqual(bandOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]), { p10: 2, median: 6, p90: 10 });
  });
});

describe("analyzeInput", () => {
  it("gives slower when the head is 1.5 x the base and the A/A band is narrow", () => {
    const a = analyzeInput(input("exec-chain-50", BASE, BASE.map((t) => t * 1.5), AA), 0.1);
    assert.equal(a.ratio, 1.5);
    assert.equal(a.band.median, 1.5);
    assert.equal(a.aa.containsOne, true);
    assert.equal(a.counts, true);
    assert.ok(a.effect.lo > 1.1);
    assert.equal(a.verdict, "slower");
    assert.equal(a.baseMs, 1);
    assert.equal(a.headMs, 1.5);
  });

  it("gives no change for a head within the budget", () => {
    assert.equal(analyzeInput(input("x", BASE, BASE.map((t) => t * 1.03), AA), 0.1).verdict, "no change");
  });

  it("does not count a run whose A/A band excludes 1.0", () => {
    const a = analyzeInput(input("x", BASE, BASE.map((t) => t * 2), [1.03, 1.04, 1.05, 1.03, 1.04, 1.05]), 0.1);
    assert.equal(a.counts, false);
    assert.equal(a.verdict, "cannot decide");
    assert.match(a.reason, /excludes 1\.0/);
  });

  it("gives slower for a large effect, also with a wide A/A band", () => {
    const a = analyzeInput(input("x", BASE, BASE.map((t) => t * 2), [0.8, 1.2, 1, 0.85, 1.15, 1]), 0.1);
    assert.equal(a.counts, true);
    assert.equal(a.verdict, "slower");
  });

  it("cannot decide when a wide A/A band takes the interval across a bound", () => {
    const a = analyzeInput(input("x", BASE, BASE.map((t) => t * 1.12), [0.8, 1.2, 1, 0.85, 1.15, 1]), 0.1);
    assert.equal(a.counts, true);
    assert.equal(a.verdict, "cannot decide");
    assert.match(a.reason, /effect interval/);
  });

  it("cannot decide without paired times", () => {
    const a = analyzeInput({ id: "x", ms: { base: [], head: [], "base~aa": [] }, median: {}, ratio: {} }, 0.1);
    assert.equal(a.verdict, "cannot decide");
    assert.match(a.reason, /no paired times/);
  });
});

describe("aggregateVerdict", () => {
  it("gives slower when each of the 5 runs is slower", () => {
    const v = aggregateVerdict("x", ["r1", "r2", "r3", "r4", "r5"].map((run) => sample(run, 1.3)), 0.1, 5);
    assert.equal(v.verdict, "slower");
    assert.equal(v.median, 1.3);
    assert.deepEqual(v.runs, ["r1", "r2", "r3", "r4", "r5"]);
  });

  it("gives faster and no change", () => {
    assert.equal(aggregateVerdict("x", ["a", "b", "c", "d", "e"].map((run) => sample(run, 0.8)), 0.1, 5).verdict, "faster");
    assert.equal(aggregateVerdict("x", ["a", "b", "c", "d", "e"].map((run, i) => sample(run, 0.97 + i * 0.02)), 0.1, 5).verdict, "no change");
  });

  it("replaces a run whose A/A band excludes 1.0 with the next run, in the order of the runs, and keeps both ids", () => {
    const samples = [sample("r1", 1.3), sample("r2", 0.5, { counts: false }), sample("r3", 1.3), sample("r4", 1.3), sample("r5", 1.3), sample("r6", 1.3), sample("r7", 0.5)];
    const v = aggregateVerdict("x", samples, 0.1, 5);
    assert.deepEqual(v.runs, ["r1", "r3", "r4", "r5", "r6"]);
    assert.deepEqual(v.excluded, ["r2"]);
    // A counted run after the first 5 is not chosen by its value: it stays out of the verdict
    assert.deepEqual(v.extra, ["r7"]);
    assert.equal(v.verdict, "slower");
  });

  it("cannot decide with fewer than 5 runs that count", () => {
    const v = aggregateVerdict("x", [sample("r1", 1.3), sample("r2", 1.3, { counts: false }), sample("r3", 1.3), sample("r4", 1.3), sample("r5", 1.3)], 0.1, 5);
    assert.equal(v.verdict, "cannot decide");
    assert.match(v.reason, /4 of 5 runs count \(the A\/A band of r2 excludes 1\.0\)/);
  });

  it("widens the ratios by the worst A/A half-spread of the counted runs", () => {
    const v = aggregateVerdict("x", ["a", "b", "c", "d", "e"].map((run, i) => sample(run, 1.15, { spread: i === 4 ? 0.1 : 0.01 })), 0.1, 5);
    assert.equal(v.worstSpread, 0.1);
    assert.ok(Math.abs(v.halfSpread - 0.1) < 1e-12);
    assert.ok(Math.abs(v.effect.lo - 1.05) < 1e-12);
    assert.equal(v.verdict, "cannot decide");
    assert.match(v.reason, /worst A\/A half-spread 0\.100/);
  });

  it("gives slower for a large effect with a wide A/A band (the 11-02 case of exec-chain-50)", () => {
    const v = aggregateVerdict("x", [3.64, 3.68, 3.7, 3.75, 3.84].map((ratio, i) => sample(`r${i}`, ratio, { spread: 0.093 })), 0.1, 5);
    assert.equal(v.verdict, "slower");
  });

  it("needs noise under the budget for no change, and cannot decide when the runs cross a bound", () => {
    const noisy = aggregateVerdict("x", ["a", "b", "c", "d", "e"].map((run) => sample(run, 1, { spread: 0.12 })), 0.1, 5);
    assert.equal(noisy.verdict, "cannot decide");
    const mixed = aggregateVerdict("x", [1.3, 1.3, 1.05, 1.3, 1.3].map((ratio, i) => sample(`r${i}`, ratio)), 0.1, 5);
    assert.equal(mixed.verdict, "cannot decide");
    assert.match(mixed.reason, /is not outside 1 ± 0\.1, and not inside it/);
  });
});

describe("verdictsOf and the summaries", () => {
  /** This function makes the record of one run with one benchmark. */
  const record = (id: string, sampleNo: number, ratio: number, counts = true) => ({
    schema: "client-bench-paired/1",
    refs: { base: "aaa", head: "bbb" },
    run: { id, attempt: "1", sample: String(sampleNo), label: `${id}/1/${sampleNo}` },
    context: { cpu: "Test CPU", cores: 4, node: "v26.0.0", platform: "linux", arch: "x64" },
    report: { mode: "fresh" },
    repeats: 12,
    warmup: 2,
    budget: 0.1,
    skipped: [],
    analysis: [{ ...sample("", ratio, { counts }).analysis, id: "exec-chain-50", band: { p10: ratio, median: ratio, p90: ratio }, effect: { lo: ratio, hi: ratio }, verdict: counts ? verdictOf({ lo: ratio, hi: ratio }, 0.1) : "cannot decide" }],
  });

  it("orders the records by the run id, then the sample, before it chooses the runs", () => {
    const records = [record("200", 1, 1.3), record("100", 2, 1.3), record("100", 1, 0.5, false), record("100", 3, 1.3), record("100", 4, 1.3), record("100", 5, 1.3)];
    const v = verdictsOf(records, 0.1, 5);
    assert.deepEqual(v.benchmarks[0].excluded, ["100/1/1"]);
    assert.deepEqual(v.benchmarks[0].runs, ["100/1/2", "100/1/3", "100/1/4", "100/1/5", "200/1/1"]);
    assert.equal(v.benchmarks[0].verdict, "slower");
    const md = verdictMarkdown(v);
    assert.match(md, /head\/base time, lower is better/);
    assert.ok(md.includes("| exec-chain-50 | 1.00000 | 1.30000 | 1.300 | 1.300 to 1.300 | 0.010 | [1.290, 1.310] | slower | 100/1/1 |"));
  });

  it("refuses records of different refs", () => {
    const other = { ...record("2", 1, 1), refs: { base: "ccc", head: "bbb" } };
    assert.throws(() => verdictsOf([record("1", 1, 1), other], 0.1, 5), /different refs/);
  });

  it("names a run whose A/A band excludes 1.0 in the summary of the run", () => {
    const md = runMarkdown(record("300", 2, 1.2, false));
    assert.match(md, /\*\*no: does not count\*\*/);
    assert.match(md, /Run 300\/1\/2: the A\/A band of exec-chain-50 excludes 1\.0/);
  });
});

describe("the workloads of the child", () => {
  it("cover each benchmark of the core and collections bench files, with the name of its result file", () => {
    const names = ["packages/client/bench/core.bench.ts", "packages/client-collections/bench/storage.bench.ts"].flatMap((file) =>
      [...readFileSync(new URL(`../${file}`, import.meta.url), "utf8").matchAll(/result\("([^"]+)"\)/g)].map((m) => m[1]),
    );
    assert.ok(names.length >= 14);
    assert.deepEqual(WORKLOADS.filter((w) => w.measure === undefined).map((w) => w.id).sort(), [...names].sort());
  });

  it("gives each core workload a setup, a cold and a warm measure", () => {
    for (const id of CORE) {
      const fixed = WORKLOADS.find((w) => w.id === id);
      const setup = WORKLOADS.find((w) => w.id === `${id}-setup`);
      assert.equal(setup?.measure, "setup");
      assert.equal(setup?.calls, 1);
      const cold = WORKLOADS.find((w) => w.id === `${id}-cold`);
      const warm = WORKLOADS.find((w) => w.id === `${id}-warm`);
      assert.ok(fixed !== undefined && cold !== undefined && warm !== undefined, id);
      assert.equal(cold.measure, "cold");
      assert.equal(cold.calls, COLD_CALLS);
      assert.equal(warm.measure, "warm");
      assert.equal(warm.calls, Math.max(1, Math.round(fixed.calls / 5)));
      assert.equal(warm.file, fixed.file);
    }
  });

  it("gives the setup time: the clock from the start of the process at the end of the first call", async () => {
    let now = 40;
    let calls = 0;
    const ms = await timeSetup({ id: "w-setup", pkg: "client", file: "f", calls: 1, measure: "setup", make: async () => () => 0 }, async () => ((calls += 1), (now += 3)), () => now);
    assert.equal(calls, 1);
    assert.equal(ms, 43);
  });

  it("times the first calls of a cold measure, with no warm-up", async () => {
    let calls = 0;
    let now = 0;
    const ms = await timeWorkload({ id: "w-cold", pkg: "client", file: "f", calls: 3, measure: "cold", make: async () => () => 0 }, () => ((calls += 1), (now += 2)), 5, () => now);
    assert.equal(calls, 3);
    assert.equal(ms, 2);
  });

  it("is stable when the last chunks agree within 5 %, after the fewest chunks", () => {
    const flat = Array.from({ length: WARM.min }, () => 1);
    assert.equal(isStable(flat), true);
    assert.equal(isStable(flat.slice(1)), false);
    assert.equal(isStable([...flat, 1, 1.04]), true);
    assert.equal(isStable([...flat, 1, 1.06]), false);
  });

  it("times chunks until the time per call is stable, and gives the median of the last chunks", async () => {
    // The time per call falls from 10 to 1 over the first 12 chunks, then stays at 1, 1.02, 0.99
    const perCall = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1.5, 1.2, 1.1, 1, 1.02, 0.99, 1, 1];
    let now = 0;
    let chunk = 0;
    let inChunk = 0;
    const workload: Workload = { id: "w-warm", pkg: "client", file: "f", calls: 2, measure: "warm", make: async () => () => 0 };
    const call = () => {
      now += perCall[chunk];
      inChunk += 1;
      if (inChunk === workload.calls) (chunk += 1), (inChunk = 0);
    };
    const warm = await timeWarm(workload, call, () => now);
    assert.equal(warm.stable, true);
    assert.equal(warm.chunks, 15);
    assert.equal(warm.ms, 1);
    assert.equal(await timeWorkload({ ...workload }, () => (now += 1), 2, () => now), 1);
  });

  it("stops after the most chunks when the time is not stable", async () => {
    let now = 0;
    let n = 0;
    const warm = await timeWarm({ id: "w-warm", pkg: "client", file: "f", calls: 1, measure: "warm", make: async () => () => 0 }, () => (now += (n += 1) % 2 === 0 ? 1 : 2), () => now);
    assert.equal(warm.stable, false);
    assert.equal(warm.chunks, WARM.max);
  });

  it("times one pass of a fixed count of calls after the warm-up passes, and gives the time of one call", async () => {
    let calls = 0;
    let now = 0;
    const ms = await timeWorkload({ id: "w", pkg: "client", file: "f", calls: 4, make: async () => () => 0 }, () => ((calls += 1), (now += 0.5)), 2, () => now);
    assert.equal(calls, 12);
    assert.equal(ms, 0.5);
  });

  it("awaits each call of an async workload, and not of a sync one", async () => {
    const order: string[] = [];
    await pass(async () => { order.push("start"); await null; order.push("end"); }, 2, false);
    assert.deepEqual(order, ["start", "end", "start", "end"]);
    let n = 0;
    await pass(() => (n += 1), 3, true);
    assert.equal(n, 3);
  });
});
