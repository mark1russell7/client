import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { markdownOf, rowsOf } from "./compile-cache.ts";
import type { PairedReport } from "./lib/paired-time.mjs";

const report = (ms: Record<string, number[]>): PairedReport => {
  const median = (values: number[]) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
  const medians = Object.fromEntries(Object.entries(ms).map(([arm, values]) => [arm, median(values)]));
  return {
    schema: "paired-time/1",
    mode: "fresh",
    env: { cpu: "test", cores: 1, os: "test", arch: "x64", node: "v0" },
    base: "main",
    arms: Object.keys(ms),
    inputs: [{ id: "exec-one-call-setup", ms, median: medians, ratio: Object.fromEntries(Object.entries(medians).map(([arm, m]) => [arm, m / medians.main])) }],
    ratios: {},
    noiseFloor: null,
  };
};

describe("compile-cache", () => {
  it("gives the saving of the warm arm, the cost of the cold arm and the A/A band", () => {
    const [row] = rowsOf(
      report({
        main: [100, 100, 100],
        "main~aa": [98, 100, 103],
        cold: [102, 101, 103],
        warm: [80, 81, 79],
      }),
    );
    assert.equal(row.warmSavingMs, 20);
    assert.equal(row.coldAddedMs, 2);
    assert.equal(row.warmRatio, 0.8);
    assert.ok(Math.abs(row.aa.p10 - 0.984) < 1e-9);
    assert.ok(Math.abs(row.aa.p90 - 1.024) < 1e-9);
    assert.equal(row.coldWithinNoise, true);
    assert.equal(row.warmFaster, true);
    assert.equal(row.breakEven.median, 0.1);
    assert.equal(row.paysFromRun, 2);
  });

  it("gives the break-even with its interval, and no break-even when the warm arm saves nothing", () => {
    const [row] = rowsOf(report({ main: [100, 100, 100], "main~aa": [100, 100, 100], cold: [170, 180, 190], warm: [60, 60, 60] }));
    assert.equal(row.breakEven.median, 2);
    assert.ok(Math.abs(row.breakEven.low - 1.8) < 1e-9);
    assert.ok(Math.abs(row.breakEven.high - 2.2) < 1e-9);
    assert.equal(row.paysFromRun, 3);
    const [none] = rowsOf(report({ main: [100, 100, 100], "main~aa": [100, 100, 100], cold: [150, 150, 150], warm: [101, 101, 101] }));
    assert.equal(none.breakEven.median, Number.POSITIVE_INFINITY);
    assert.equal(none.paysFromRun, Number.POSITIVE_INFINITY);
  });

  it("finds a cold arm that is slower than the noise", () => {
    const [row] = rowsOf(report({ main: [100, 100, 100], "main~aa": [99, 100, 101], cold: [110, 111, 109], warm: [100, 99, 101] }));
    assert.equal(row.coldWithinNoise, false);
    assert.equal(row.warmFaster, false);
  });

  it("gives a table row for each input and the behavior of the cache", () => {
    const rows = rowsOf(report({ main: [100, 100, 100], "main~aa": [100, 100, 100], cold: [102, 102, 102], warm: [80, 80, 80] }));
    const md = markdownOf({
      ref: "abc",
      node: "v26.0.0",
      rows,
      warmCache: { files: 3, bytes: 2048 },
      behavior: { "A folder under a file": { status: "FAILED", message: "Cannot create cache directory: not a directory", exitCode: 0 } },
    });
    assert.ok(md.includes("| `exec-one-call-setup` | 100.0 | 102.0 | 80.0 | 20.0 | 2.0 | 1.020 | 0.800 | 1.000 to 1.000 | no | yes | 0.10 (0.10 to 0.10) | 2 |"));
    assert.ok(md.includes("| A folder under a file | FAILED | 0 | Cannot create cache directory: not a directory |"));
    assert.ok(md.includes("The warm cache has 3 files, 2.0 KB."));
  });
});
