// The tests of scripts/bench-context.ts (O82), with records and runners in memory.
// Start them with: node --test scripts/bench-context.test.ts

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_SETTINGS, NO_VERDICT, modeOf, runnerContext, summaryOf, withContext } from "./bench-context.ts";

const system = { cpus: [{ model: " AMD EPYC 7763 64-Core Processor " }, { model: "AMD EPYC 7763 64-Core Processor" }], node: "v26.0.0", platform: "linux", arch: "x64" };
const record = { latency: { mean: 0.5, p50: 0.4, samplesCount: 2000 }, throughput: { mean: 2000 }, period: 0.5, totalTime: 1000.25 };

describe("runnerContext", () => {
  it("gives the CPU model, the core count, Node, the platform and the arch", () => {
    assert.deepEqual(runnerContext({}, system), { cpu: "AMD EPYC 7763 64-Core Processor", cores: 2, node: "v26.0.0", platform: "linux", arch: "x64" });
  });

  it("adds the GitHub runner fields that are set", () => {
    assert.deepEqual(runnerContext({ RUNNER_NAME: "GitHub Actions 12", ImageOS: "ubuntu24" }, system).runner, { name: "GitHub Actions 12", image: "ubuntu24" });
    assert.deepEqual(runnerContext({ RUNNER_NAME: "r", ImageOS: "ubuntu24", ImageVersion: "20261020.1" }, system).runner, { name: "r", image: "ubuntu24", imageVersion: "20261020.1" });
  });

  it("gives an unknown CPU without CPU information", () => {
    assert.equal(runnerContext({}, { ...system, cpus: [] }).cpu, "unknown");
  });
});

describe("modeOf", () => {
  it("gives the tool, the samples, the total time and the settings of the record", () => {
    assert.deepEqual(modeOf(record, { vitest: "5.0.3", benchFiles: ["packages/client/bench/core.bench.ts"], ci: true }), {
      tool: "vitest bench --run",
      ci: true,
      vitest: "5.0.3",
      benchFiles: ["packages/client/bench/core.bench.ts"],
      samples: 2000,
      totalTimeMs: 1000.25,
      settings: DEFAULT_SETTINGS,
    });
  });

  it("omits the fields that the record does not have", () => {
    assert.deepEqual(modeOf({}), { tool: "vitest bench --run", ci: false, benchFiles: [], settings: DEFAULT_SETTINGS });
  });
});

describe("withContext", () => {
  it("keeps the fields of vitest and replaces an earlier context", () => {
    const result = withContext({ ...record, context: { old: true } }, { cpu: "x" });
    assert.deepEqual(result, { ...record, context: { cpu: "x" } });
    assert.equal(result.latency?.mean, 0.5);
  });
});

describe("summaryOf", () => {
  const context = { ...runnerContext({ RUNNER_NAME: "r", ImageOS: "ubuntu24", ImageVersion: "1.2" }, system), ci: true };
  const summary = summaryOf([{ name: "exec-one-call", folder: "packages/client/bench/results", mean: 0.5, median: 0.4, samples: 2000 }, { name: "no-times", folder: "f" }], context);

  it("has the line of no verdict and the context lines", () => {
    assert.ok(summary.includes(NO_VERDICT));
    assert.ok(summary.includes("- CPU: AMD EPYC 7763 64-Core Processor (2 cores)"));
    assert.ok(summary.includes("- Node: v26.0.0, linux/x64"));
    assert.ok(summary.includes("- Runner: r, image ubuntu24, version 1.2"));
    assert.ok(summary.includes("- Mode: vitest bench --run in CI"));
  });

  it("has a row with the mean and the median of each benchmark", () => {
    assert.ok(summary.includes("| exec-one-call | packages/client/bench/results | 0.5000 | 0.4000 | 2000 |"));
    assert.ok(summary.includes("| no-times | f | — | — | — |"));
  });
});
