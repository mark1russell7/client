/**
 * test.run procedure
 *
 * Run tests for a package using vitest.
 */

import type { ProcedureContext } from "@mark1russell7/client";
import type { TestRunInput, TestRunOutput } from "../../types.js";

export async function testRun(
  input: TestRunInput,
  ctx: ProcedureContext
): Promise<TestRunOutput> {
  const startTime = Date.now();

  // Build vitest command
  const args: string[] = ["vitest"];

  if (input.watch) {
    // Watch mode - just "vitest" without "run"
  } else {
    args.push("run");
  }

  if (input.pattern) {
    args.push(input.pattern);
  }

  if (input.coverage) {
    args.push("--coverage");
  }

  if (input.reporter) {
    args.push("--reporter", input.reporter);
  }

  // Execute via shell.exec
  const result = await ctx.client.call(["shell", "exec"], {
    command: args.join(" "),
    cwd: input.cwd,
    timeout: input.timeout,
  });

  const shellResult = result as {
    exitCode: number;
    stdout: string;
    stderr: string;
    success: boolean;
  };

  return {
    success: shellResult.exitCode === 0,
    exitCode: shellResult.exitCode,
    stdout: shellResult.stdout,
    stderr: shellResult.stderr,
    duration: Date.now() - startTime,
  };
}
