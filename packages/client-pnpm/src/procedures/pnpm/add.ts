/**
 * pnpm.add procedure
 *
 * Add packages using pnpm.
 */

import type { ProcedureContext } from "@mark1russell7/client";
import type { PnpmAddInput, PnpmCommandOutput } from "../../types.js";

/**
 * Add packages using pnpm
 *
 * @example
 * // Add a package
 * await client.call(["pnpm", "add"], {
 *   packages: ["lodash"],
 * });
 *
 * @example
 * // Add as dev dependency
 * await client.call(["pnpm", "add"], {
 *   packages: ["vitest", "@types/node"],
 *   dev: true,
 * });
 */
export async function pnpmAdd(
  input: PnpmAddInput,
  ctx: ProcedureContext
): Promise<PnpmCommandOutput> {
  const startTime = Date.now();

  try {
    const args: string[] = ["add", ...input.packages];

    // Add flags
    if (input.dev) args.push("--save-dev");
    if (input.global) args.push("--global");

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
