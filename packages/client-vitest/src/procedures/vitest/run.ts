/**
 * vitest.run and vitest.coverage: run the tests of a project once, with the project's own vitest.
 *
 * The result has the counts from vitest's JSON report, the exit code and the end of the output.
 * With `coverage`, it also has the coverage percentages from a `json-summary` report. Both reports
 * go to a temporary folder. (vitest.coverage replaces test.coverage of the retired client-test.)
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCommand } from "@mark1russell7/client-shell/command";
import type { VitestCoverageInput, VitestRunInput, VitestRunOutput } from "../../types.js";
import { resolveVitestCli } from "../../vitest-cli.js";

/** The procedure keeps the last 64 KiB of each output stream. */
const OUTPUT_LIMIT = 64 * 1024;

function assertPattern(pattern: string): string {
  if (pattern.startsWith("-")) {
    throw new Error(`Invalid test pattern (starts with "-"): ${pattern}`);
  }
  return pattern;
}

interface VitestJsonReport {
  success?: boolean;
  numPassedTests?: number;
  numFailedTests?: number;
  numPendingTests?: number;
  startTime?: number;
}

interface CoverageSummary {
  total?: Record<"lines" | "branches" | "functions" | "statements", { pct?: number } | undefined>;
}

function readCoverage(file: string): VitestRunOutput["coverage"] {
  if (!existsSync(file)) return undefined;
  const total = (JSON.parse(readFileSync(file, "utf8")) as CoverageSummary).total;
  if (!total) return undefined;
  return {
    lines: total.lines?.pct ?? 0,
    branches: total.branches?.pct ?? 0,
    functions: total.functions?.pct ?? 0,
    statements: total.statements?.pct ?? 0,
  };
}

/** The part of the procedure context that the vitest procedures read. */
interface VitestContext {
  metadata: Record<string, unknown>;
  signal?: AbortSignal | undefined;
}

export async function vitestRun(
  input: VitestRunInput,
  ctx: VitestContext
): Promise<VitestRunOutput> {
  if (input.watch) {
    throw new Error("vitest.run runs the tests once. Use vitest.watch for watch mode.");
  }

  const cwd = input.cwd ?? process.cwd();
  const cli = resolveVitestCli(cwd);

  // The reports go to files, so the reporter of the reader prints to stdout
  const reportDir = mkdtempSync(join(tmpdir(), "vitest-run-"));
  const reportFile = join(reportDir, "report.json");
  const coverageDir = join(reportDir, "coverage");

  const reporter = input.reporter && input.reporter !== "json" ? input.reporter : "default";
  const args = [cli, "run", "--reporter", reporter, "--reporter", "json", "--outputFile.json", reportFile];
  for (const pattern of input.include ?? []) {
    args.push(assertPattern(pattern));
  }
  for (const pattern of input.exclude ?? []) {
    args.push("--exclude", assertPattern(pattern));
  }
  if (input.coverage) {
    args.push(
      "--coverage.enabled",
      "--coverage.reporter=json-summary",
      "--coverage.reporter=text-summary",
      `--coverage.reportsDirectory=${coverageDir}`,
    );
  }
  if (input.passWithNoTests) {
    args.push("--passWithNoTests");
  }

  const started = Date.now();
  // No shell: test patterns cannot inject commands. The signal kills vitest and its workers.
  const run = await runCommand(process.execPath, {
    args,
    cwd,
    signal: ctx.signal,
    maxOutputBytes: OUTPUT_LIMIT,
    keep: "tail",
  });
  if (run.error) {
    rmSync(reportDir, { recursive: true, force: true });
    throw new Error(`vitest did not start: ${run.error}`);
  }
  const code = run.signal ? null : run.exitCode;

  const output = { exitCode: code ?? -1, stdout: run.stdout, stderr: run.stderr };
  try {
    const coverage = input.coverage ? readCoverage(join(coverageDir, "coverage-summary.json")) : undefined;
    let report: VitestJsonReport | undefined;
    try {
      report = JSON.parse(readFileSync(reportFile, "utf8")) as VitestJsonReport;
    } catch {
      // No report: vitest failed before it ran the tests (for example, a config error)
    }
    return {
      success: report?.success ?? code === 0,
      passed: report?.numPassedTests ?? 0,
      failed: report?.numFailedTests ?? (code === 0 ? 0 : 1),
      skipped: report?.numPendingTests ?? 0,
      duration: report?.startTime ? Date.now() - report.startTime : Date.now() - started,
      ...output,
      ...(coverage ? { coverage } : {}),
    };
  } finally {
    rmSync(reportDir, { recursive: true, force: true });
  }
}

export async function vitestCoverage(
  input: VitestCoverageInput,
  ctx: VitestContext
): Promise<VitestRunOutput> {
  const { threshold, ...run } = input;
  const result = await vitestRun({ ...run, coverage: true }, ctx);
  if (threshold === undefined || !result.success) return result;
  if (!result.coverage) {
    return {
      ...result,
      success: false,
      stderr: `${result.stderr}\nNo coverage report: is a coverage provider (@vitest/coverage-v8) installed?`,
    };
  }
  return { ...result, success: result.coverage.lines >= threshold };
}
