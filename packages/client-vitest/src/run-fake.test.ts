/**
 * vitest.run and vitest.coverage with a fake runCommand: the argument list, a run that did not
 * start or that a signal ended, and the reports that are missing. No vitest starts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const runCommand = vi.hoisted(() => vi.fn());
vi.mock("@procedures/shell/command", () => ({ runCommand }));

const { vitestCoverage, vitestRun } = await import("./procedures/vitest/run.js");
const { resolveVitestCli } = await import("./vitest-cli.js");

const cwd = join(dirname(fileURLToPath(import.meta.url)), "..");
const ctx = { metadata: {} };

interface Run {
  exitCode?: number;
  signal?: string;
  error?: string;
  report?: object;
  coverage?: object;
}

/** runCommand gives `run`, and writes the report files that `run` names. */
function fake(run: Run): void {
  runCommand.mockImplementation(async (_command: string, options: { args: string[] }) => {
    const args = options.args;
    const reportFile = args[args.indexOf("--outputFile.json") + 1]!;
    if (run.report) writeFileSync(reportFile, JSON.stringify(run.report));
    const coverageDir = args.find((arg) => arg.startsWith("--coverage.reportsDirectory="))?.split("=")[1];
    if (run.coverage && coverageDir) {
      mkdirSync(coverageDir, { recursive: true });
      writeFileSync(join(coverageDir, "coverage-summary.json"), JSON.stringify(run.coverage));
    }
    const exitCode = run.exitCode ?? 0;
    return { exitCode, stdout: "", stderr: "", success: exitCode === 0, duration: 1, ...(run.signal ? { signal: run.signal } : {}), ...(run.error ? { error: run.error } : {}) };
  });
}

beforeEach(() => {
  runCommand.mockReset();
});

describe("vitest.run with a fake runCommand", () => {
  it("gives the patterns, the excludes and the options to vitest", async () => {
    fake({ report: { success: true, numPassedTests: 3, numFailedTests: 0, numPendingTests: 0, startTime: Date.now() } });
    const result = await vitestRun({ cwd, include: ["sum"], exclude: ["slow"], reporter: "json", passWithNoTests: true }, ctx);
    expect(result).toMatchObject({ success: true, passed: 3, failed: 0, exitCode: 0 });
    const args = runCommand.mock.calls[0]![1].args as string[];
    expect(args.slice(1, 4)).toEqual(["run", "--reporter", "default"]);
    expect(args.slice(-4)).toEqual(["sum", "--exclude", "slow", "--passWithNoTests"]);
  });

  it("refuses watch mode and an exclude that is an option", async () => {
    await expect(vitestRun({ cwd, watch: true }, ctx)).rejects.toThrow("Use vitest.watch");
    await expect(vitestRun({ cwd, exclude: ["--globals"] }, ctx)).rejects.toThrow(/Invalid test pattern/);
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("throws when vitest did not start", async () => {
    fake({ exitCode: 1, error: "spawn EACCES" });
    await expect(vitestRun({ cwd }, ctx)).rejects.toThrow("vitest did not start: spawn EACCES");
  });

  it("counts a run with no report from its exit code, and a signal as a failure", async () => {
    fake({ exitCode: 0 });
    expect(await vitestRun({ cwd }, ctx)).toMatchObject({ success: true, passed: 0, failed: 0, exitCode: 0 });
    fake({ exitCode: 1, signal: "SIGTERM" });
    expect(await vitestRun({ cwd }, ctx)).toMatchObject({ success: false, failed: 1, exitCode: -1 });
  });
});

describe("vitest.coverage with a fake runCommand", () => {
  it("fails a threshold when there is no coverage report", async () => {
    fake({ report: { success: true } });
    const result = await vitestCoverage({ cwd, threshold: 50 }, ctx);
    expect(result.success).toBe(false);
    expect(result.stderr).toContain("No coverage report");
  });

  it("reads 0 for a metric that the summary does not give, and no coverage for a summary with no total", async () => {
    fake({ report: { success: true }, coverage: { total: { lines: { pct: 80 }, branches: {} } } });
    expect((await vitestRun({ cwd, coverage: true }, ctx)).coverage).toEqual({ lines: 80, branches: 0, functions: 0, statements: 0 });
    fake({ report: { success: true }, coverage: {} });
    expect((await vitestRun({ cwd, coverage: true }, ctx)).coverage).toBeUndefined();
  });
});

describe("resolveVitestCli", () => {
  function project(vitest?: object): string {
    const dir = mkdtempSync(join(tmpdir(), "vitest-cli-"));
    writeFileSync(join(dir, "package.json"), "{}");
    if (vitest) {
      mkdirSync(join(dir, "node_modules", "vitest"), { recursive: true });
      writeFileSync(join(dir, "node_modules", "vitest", "package.json"), JSON.stringify({ name: "vitest", ...vitest }));
    }
    return dir;
  }

  // No "vitest is not installed" case: resolution walks up from the temp dir, and on the CI
  // runner a vitest above it resolves, so the outcome depends on the machine.
  it("reads a bin that is a string, and fails with no bin", () => {
    const withBin = project({ bin: "vitest.mjs" });
    expect(resolveVitestCli(withBin)).toBe(join(withBin, "node_modules", "vitest", "vitest.mjs"));
    expect(() => resolveVitestCli(project({}))).toThrow('has no "vitest" bin');
  });
});
