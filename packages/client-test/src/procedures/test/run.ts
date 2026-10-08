/**
 * test.run procedure
 *
 * Run tests for a package using vitest.
 */

import type { ProcedureContext } from "@mark1russell7/client";
import type { TestRunInput, TestRunOutput } from "../../types.js";
import { assertNotOption, resolveVitestCli } from "../../vitest-cli.js";

export async function testRun(
  input: TestRunInput,
  ctx: ProcedureContext
): Promise<TestRunOutput> {
  if (input.watch) {
    // Watch mode never exits, so this procedure would never return
    throw new Error("test.run runs the tests once. Use vitest.watch for watch mode.");
  }

  const startTime = Date.now();
  const cwd = input.cwd ?? process.cwd();

  // Build the vitest arguments (no shell: nothing here is parsed by a shell)
  const args: string[] = [resolveVitestCli(cwd), "run"];

  if (input.pattern) {
    args.push(assertNotOption("pattern", input.pattern));
  }

  if (input.coverage) {
    args.push("--coverage");
  }

  if (input.reporter) {
    args.push("--reporter", assertNotOption("reporter", input.reporter));
  }

  const result = await ctx.client.call(["shell", "run"], {
    command: process.execPath,
    args,
    cwd,
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
