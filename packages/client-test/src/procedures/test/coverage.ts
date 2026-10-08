/**
 * test.coverage procedure
 *
 * Run tests with coverage reporting.
 */

import type { ProcedureContext } from "@mark1russell7/client";
import type { TestCoverageInput, TestCoverageOutput } from "../../types.js";
import { assertNotOption, resolveVitestCli } from "../../vitest-cli.js";

export async function testCoverage(
  input: TestCoverageInput,
  ctx: ProcedureContext
): Promise<TestCoverageOutput> {
  const startTime = Date.now();
  const cwd = input.cwd ?? process.cwd();

  // Build the vitest arguments (no shell: nothing here is parsed by a shell)
  const args = [resolveVitestCli(cwd), "run", "--coverage"];

  if (input.pattern) {
    args.push(assertNotOption("pattern", input.pattern));
  }

  const result = await ctx.client.call(["shell", "run"], {
    command: process.execPath,
    args,
    cwd,
  });

  const shellResult = result as {
    exitCode: number;
    stdout: string;
    stderr: string;
    success: boolean;
  };

  // Try to parse coverage percentage from output
  let coverage: number | undefined;
  const coverageMatch = shellResult.stdout.match(/All files[^|]*\|\s*([\d.]+)/);
  if (coverageMatch) {
    coverage = parseFloat(coverageMatch[1] ?? "0");
  }

  // Check threshold if specified
  let success = shellResult.exitCode === 0;
  if (success && input.threshold !== undefined && coverage !== undefined) {
    success = coverage >= input.threshold;
  }

  return {
    success,
    exitCode: shellResult.exitCode,
    stdout: shellResult.stdout,
    stderr: shellResult.stderr,
    duration: Date.now() - startTime,
    coverage,
  };
}
