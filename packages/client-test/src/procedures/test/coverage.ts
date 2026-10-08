/**
 * test.coverage procedure
 *
 * Run tests with coverage reporting.
 */

import type { ProcedureContext } from "@mark1russell7/client";
import type { TestCoverageInput, TestCoverageOutput } from "../../types.js";

export async function testCoverage(
  input: TestCoverageInput,
  ctx: ProcedureContext
): Promise<TestCoverageOutput> {
  const startTime = Date.now();

  // Build vitest command with coverage
  const args = ["vitest", "run", "--coverage"];

  if (input.pattern) {
    args.push(input.pattern);
  }

  // Execute via shell.exec
  const result = await ctx.client.call(["shell", "exec"], {
    command: args.join(" "),
    cwd: input.cwd,
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
