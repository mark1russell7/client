/**
 * vitest.run and vitest.coverage against a small project (fixtures/project), with real vitest runs.
 * vitest.coverage replaced test.coverage of the retired client-test (ARCHITECTURE-PROPOSALS P4).
 */

import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { vitestCoverage, vitestRun } from "./procedures/vitest/run.js";

const cwd = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "project");
const ctx = { metadata: {} };

describe("vitest.run", () => {
  it("gives the counts, the exit code and the output", async () => {
    const result = await vitestRun({ cwd, include: ["sum"] }, ctx);
    expect(result).toMatchObject({ success: true, passed: 2, failed: 0, skipped: 1, exitCode: 0 });
    expect(result.stdout).toContain("2 passed");
    expect(result.coverage).toBeUndefined();
  }, 60_000);

  it("reports a failing test", async () => {
    const result = await vitestRun({ cwd, include: ["fail"] }, ctx);
    expect(result).toMatchObject({ success: false, passed: 0, failed: 1 });
    expect(result.exitCode).not.toBe(0);
  }, 60_000);

  it("rejects a pattern that is an option", async () => {
    await expect(vitestRun({ cwd, include: ["--globals"] }, ctx)).rejects.toThrow(/Invalid test pattern/);
  });
});

describe("vitest.coverage", () => {
  it("gives the coverage percentages", async () => {
    const result = await vitestCoverage({ cwd, include: ["sum"] }, ctx);
    expect(result.success).toBe(true);
    expect(result.coverage?.functions).toBe(50);
    expect(result.coverage?.lines).toBeGreaterThan(0);
    expect(result.coverage?.lines).toBeLessThan(100);
  }, 60_000);

  it("fails below the threshold", async () => {
    const result = await vitestCoverage({ cwd, include: ["sum"], threshold: 99 }, ctx);
    expect(result.success).toBe(false);
    expect(result.passed).toBe(2);
  }, 60_000);
});
