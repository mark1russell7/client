import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VitestRunInput, VitestRunOutput } from "../../types.js";
import { resolveVitestCli } from "../../vitest-cli.js";

/**
 * Reject a test pattern that the vitest CLI would read as an option
 */
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

export async function vitestRun(
  input: VitestRunInput,
  _ctx: { metadata: Record<string, unknown> }
): Promise<VitestRunOutput> {
  if (input.watch) {
    throw new Error("vitest.run runs the tests once. Use vitest.watch for watch mode.");
  }

  const cwd = input.cwd ?? process.cwd();
  const cli = resolveVitestCli(cwd);

  // The JSON report goes to a file, so any reporter can print to stdout
  const reportDir = mkdtempSync(join(tmpdir(), "vitest-run-"));
  const reportFile = join(reportDir, "report.json");

  const args = [cli, "run", "--reporter", "json", "--outputFile.json", reportFile];
  if (input.reporter && input.reporter !== "json") {
    args.push("--reporter", input.reporter);
  }
  for (const pattern of input.include ?? []) {
    args.push(assertPattern(pattern));
  }
  for (const pattern of input.exclude ?? []) {
    args.push("--exclude", assertPattern(pattern));
  }
  if (input.coverage) {
    args.push("--coverage");
  }
  if (input.passWithNoTests) {
    args.push("--passWithNoTests");
  }

  const started = Date.now();
  const code = await new Promise<number | null>((resolve, reject) => {
    const proc = spawn(process.execPath, args, {
      cwd,
      shell: false,
      stdio: ["ignore", "ignore", "ignore"],
    });
    proc.on("close", resolve);
    proc.on("error", reject);
  });

  try {
    const report = JSON.parse(readFileSync(reportFile, "utf8")) as VitestJsonReport;
    return {
      success: report.success ?? code === 0,
      passed: report.numPassedTests ?? 0,
      failed: report.numFailedTests ?? 0,
      skipped: report.numPendingTests ?? 0,
      duration: report.startTime ? Date.now() - report.startTime : Date.now() - started,
    };
  } catch {
    // No report: vitest failed before running tests (for example, a config error)
    return {
      success: code === 0,
      passed: 0,
      failed: code === 0 ? 0 : 1,
      skipped: 0,
      duration: Date.now() - started,
    };
  } finally {
    rmSync(reportDir, { recursive: true, force: true });
  }
}
