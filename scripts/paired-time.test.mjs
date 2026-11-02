// The tests of scripts/lib/paired-time.mjs, the copy of paired-time/1 (O83). They are the tests of
// the source (packing d4bc44aa, packages/packing/bench/paired-time.test.ts), with node:test.
// Start them with: node --test scripts/paired-time.test.mjs

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aaId, armOrder, childResult, measureIsolated, pairedMarkdown, quantileOf, timeChild } from "./lib/paired-time.mjs";

const ENV = { cpu: "Test CPU 9000", cores: 4, os: "test", arch: "x64", node: "v0.0.0" };

/** This function makes a made-up clock: each run of an arm adds the cost of the arm on the input to the time. */
function fakeClock() {
  let now = 0;
  return { clock: () => now, spend: (/** @type {number} */ ms) => (now += ms) };
}

describe("armOrder", () => {
  it("reverses the order in odd rounds of mode process", () => {
    assert.deepEqual([0, 1, 2, 3].map((round) => armOrder(3, round, "process")), [
      [0, 1, 2],
      [2, 1, 0],
      [0, 1, 2],
      [2, 1, 0],
    ]);
  });

  it("rotates the order each round of mode fresh", () => {
    assert.deepEqual([0, 1, 2, 3].map((round) => armOrder(3, round, "fresh")), [
      [0, 1, 2],
      [1, 2, 0],
      [2, 0, 1],
      [0, 1, 2],
    ]);
  });
});

describe("quantileOf", () => {
  it("interpolates between the two nearest values", () => {
    assert.equal(quantileOf([4, 1, 3, 2], 0.5), 2.5);
    assert.ok(Math.abs(quantileOf([1, 2, 3, 4, 5], 0.1) - 1.4) < 1e-9);
    assert.ok(Number.isNaN(quantileOf([], 0.5)));
  });
});

describe("measureIsolated in mode process", () => {
  // 2 inputs of the group 1 and 2 inputs of the group 2. The value of an input gives the cost of each arm
  const inputs = [
    { id: "i1", group: "1", value: { base: 1, b: 2 } },
    { id: "i2", group: "1", value: { base: 2, b: 4 } },
    { id: "i3", group: "2", value: { base: 1, b: 3 } },
    { id: "i4", group: "2", value: { base: 1, b: 3 } },
  ];
  /** @type {string[]} */
  const calls = [];
  const { clock, spend } = fakeClock();
  const report = /** @type {import("./lib/paired-time.mjs").PairedReport} */ (
    measureIsolated({
      mode: "process",
      inputs,
      repeats: 2,
      warmup: 1,
      clock,
      env: ENV,
      context: "local",
      arms: [
        { id: "base", run: (v) => (calls.push("base"), spend(v.base)) },
        { id: "b", run: (v) => (calls.push("b"), spend(v.b)) },
      ],
    })
  );

  it("adds the A/A arm, and gives the arms in turn with the warm-up runs not timed", () => {
    assert.equal(report.schema, "paired-time/1");
    assert.deepEqual(report.arms, ["base", "b", aaId("base")]);
    // Round 0 on i1: each arm warms up once and then runs once
    assert.deepEqual(calls.slice(0, 6), ["base", "base", "b", "b", "base", "base"]);
    assert.equal(calls.length, 2 * 4 * 3 * 2);
  });

  it("keeps the raw times, the medians and the ratios of each input", () => {
    const i2 = report.inputs.find((i) => i.id === "i2");
    assert.deepEqual(i2?.ms, { base: [2, 2], b: [4, 4], "base~aa": [2, 2] });
    assert.deepEqual(i2?.ratio, { b: 2, "base~aa": 1 });
    assert.equal(i2?.group, "1");
    assert.equal(i2?.peakRss, undefined);
  });

  it("gives the median, the groups, the group SD, the noise floor and the moved share", () => {
    const b = report.ratios["b"];
    assert.equal(b.inputs, 4);
    assert.equal(b.median, 2.5);
    assert.deepEqual(b.groups, { 1: 2, 2: 3 });
    assert.equal(b.groupMean, 2.5);
    assert.equal(b.moved, 1);
    assert.ok(Math.abs(b.groupSD - Math.SQRT1_2) < 1e-9);
    assert.deepEqual(report.noiseFloor, { median: 1, p10: 1, p90: 1 });
    assert.equal(report.ratios[aaId("base")].moved, 0);
    assert.deepEqual(report.env, ENV);
  });

  it("writes a table with the arms and the noise floor", () => {
    const md = pairedMarkdown(report);
    assert.ok(md.includes("mode `process`, context `local`, on 4 x Test CPU 9000"));
    assert.ok(md.includes("Noise floor (the A/A arm): median 1.000, p10 1.000, p90 1.000."));
    assert.ok(md.includes("| `b` | 4 | 2.500 | 2.000 | 3.000 | 1.000 | 2.000 | 3.000 | 2.500 | 0.707 |"));
  });

  it("gives no A/A arm and no moved share with aa false", () => {
    const { clock: c2, spend: s2 } = fakeClock();
    const plain = /** @type {import("./lib/paired-time.mjs").PairedReport} */ (
      measureIsolated({ mode: "process", inputs, repeats: 1, clock: c2, env: ENV, aa: false, arms: [{ id: "base", run: (v) => s2(v.base) }, { id: "b", run: (v) => s2(v.b) }] })
    );
    assert.deepEqual(plain.arms, ["base", "b"]);
    assert.equal(plain.noiseFloor, null);
    assert.equal(plain.ratios["b"].moved, null);
    assert.equal(plain.ratios["b"].groups["1"], 2);
  });
});

describe("measureIsolated in mode fresh", () => {
  it("starts a child for each arm, input and round, in the rotated order, and keeps the highest peak", async () => {
    /** @type {string[]} */
    const started = [];
    const report = await measureIsolated({
      mode: "fresh",
      repeats: 2,
      warmup: 3,
      env: ENV,
      context: "ci --flag",
      inputs: [{ id: "x" }, { id: "y" }],
      arms: [
        { id: "base", command: ["child", "--arm", "base"] },
        { id: "b", command: ["child", "--arm", "b"] },
      ],
      startChild: async (command, input, warmup) => {
        started.push(`${command.join(" ")} --input ${input} --warmup ${warmup}`);
        const arm = command[2];
        const round = started.filter((s) => s.startsWith(`child --arm ${arm} `) && s.includes(`--input ${input}`)).length;
        return { ms: arm === "b" ? 4 : 2, peakRss: 1000 * round };
      },
    });
    // Round 0: x takes base, b and base (the A/A arm) in turn, then y. Round 1 starts with b
    assert.deepEqual(started.slice(0, 3), ["child --arm base --input x --warmup 3", "child --arm b --input x --warmup 3", "child --arm base --input x --warmup 3"]);
    assert.equal(started[3], "child --arm base --input y --warmup 3");
    assert.equal(started[6], "child --arm b --input x --warmup 3");
    assert.equal(started.length, 12);
    const x = report.inputs.find((i) => i.id === "x");
    assert.deepEqual(x?.ratio, { b: 2, "base~aa": 1 });
    // The A/A arm has the command of the base, so the base command runs 4 times on x
    assert.deepEqual(x?.peakRss, { base: 4000, b: 2000, "base~aa": 3000 });
    assert.equal(report.mode, "fresh");
    assert.deepEqual(report.ratios["b"].groups, { all: 2 });
    assert.equal(report.context, "ci --flag");
  });
});

describe("the child protocol", () => {
  it("reads the last line of the stdout of a child", () => {
    assert.deepEqual(childResult('log\n{"ms": 1.5}\n'), { ms: 1.5 });
    assert.deepEqual(childResult('{"ms": 2, "peakRss": 10}'), { ms: 2, peakRss: 10 });
    assert.throws(() => childResult('{"peakRss": 10}'), /no time/);
  });

  it("times one run after the warm-up runs", () => {
    let runs = 0;
    let now = 0;
    const result = timeChild(() => ((runs += 1), (now += runs)), 2, () => now);
    assert.equal(runs, 3);
    assert.equal(result.ms, 3);
    assert.ok(result.peakRss > 0);
  });
});

describe("the options", () => {
  it("throws a RangeError for a bad option", () => {
    const arms = [{ id: "a", run: () => 0 }];
    assert.throws(() => measureIsolated({ mode: "process", inputs: [], repeats: 0, arms }), RangeError);
    assert.throws(() => measureIsolated({ mode: "process", inputs: [], repeats: 1, arms: [] }), RangeError);
    assert.throws(() => measureIsolated({ mode: "process", inputs: [], repeats: 1, arms, aa: false }), RangeError);
    assert.throws(() => measureIsolated({ mode: "fresh", inputs: [], repeats: 1, arms }), /no command/);
    assert.throws(() => measureIsolated({ mode: "process", inputs: [{ id: "i" }, { id: "i" }], repeats: 1, arms }), /inputs are not unique/);
    assert.throws(() => measureIsolated({ mode: "process", inputs: [], repeats: 1, arms }), /1 input or more/);
    assert.throws(() => measureIsolated({ mode: /** @type {"process"} */ ("other"), inputs: [{ id: "i" }], repeats: 1, arms }), /not "other"/);
  });

  it("refuses a peakRss that an arm gives in mode process", () => {
    const arms = [{ id: "a", run: () => ({ peakRss: 1 }) }];
    assert.throws(() => measureIsolated({ mode: "process", inputs: [{ id: "i" }], repeats: 1, arms, env: ENV }), /peakRss in mode process/);
  });
});
