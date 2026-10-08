/**
 * pnpm.run procedure
 *
 * Run package scripts using pnpm.
 */

import type { ProcedureContext } from "@mark1russell7/client";
import type { PnpmRunInput, PnpmCommandOutput } from "../../types.js";

/**
 * Run a package script using pnpm
 *
 * @example
 * // Run build script
 * await client.call(["pnpm", "run"], {
 *   script: "build",
 * });
 *
 * @example
 * // Run test with arguments
 * await client.call(["pnpm", "run"], {
 *   script: "test",
 *   args: ["--watch"],
 * });
 */
export async function pnpmRun(
  input: PnpmRunInput,
  ctx: ProcedureContext
): Promise<PnpmCommandOutput> {
  const startTime = Date.now();

  try {
    const args: string[] = ["run", input.script];

    // Add additional arguments
    if (input.args && input.args.length > 0) {
      args.push("--", ...input.args);
    }

    // Build command string for shell.exec
    const command = ["pnpm", ...args].join(" ");

    const shellInput: {
      command: string;
      cwd?: string | undefined;
      timeout?: number | undefined;
    } = { command };

    if (input.cwd !== undefined) shellInput.cwd = input.cwd;
    if (input.timeout !== undefined) shellInput.timeout = input.timeout;

    // Call shell.exec (uses shell: true by default)
    const result = await ctx.client.call<
      typeof shellInput,
      {
        exitCode: number;
        stdout: string;
        stderr: string;
      }
    >(["shell", "exec"], shellInput);

    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      success: result.exitCode === 0,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      success: false,
      duration: Date.now() - startTime,
    };
  }
}
