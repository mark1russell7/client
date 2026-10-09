/**
 * cli.run procedure
 *
 * Wraps the mark CLI as a procedure using client-shell.
 * This allows calling any mark CLI command programmatically. The mark CLI itself uses a running
 * CLI server when that server is safe to use (same folder, same build, its token).
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProcedureContext } from "@mark1russell7/client";
import type { CliRunInput, CliRunOutput } from "../../types.js";

/**
 * Find the mark CLI of the workspace that contains this package (packages/mark/dist/cli.js)
 */
function resolveMarkCli(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      const cli = join(dir, "packages", "mark", "dist", "cli.js");
      if (existsSync(cli)) {
        return cli;
      }
      break;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error("Could not find the mark CLI (packages/mark/dist/cli.js in the workspace). Run pnpm build.");
}

/**
 * Execute via shell (spawn node process)
 */
async function shellExecution(
  input: CliRunInput,
  ctx: ProcedureContext,
  startTime: number
): Promise<CliRunOutput> {
  // Build command args: path + positional + named args
  const args: string[] = [...input.path];

  // Add positional arguments
  if (input.positional) {
    args.push(...input.positional);
  }

  // Add named arguments as --key value pairs
  if (input.args) {
    for (const [key, value] of Object.entries(input.args)) {
      if (typeof value === "boolean") {
        if (value) {
          args.push(`--${key}`);
        }
      } else {
        args.push(`--${key}`, String(value));
      }
    }
  }

  // Build shell input
  const shellInput: {
    command: string;
    args: string[];
    cwd?: string | undefined;
    timeout?: number | undefined;
  } = {
    command: process.execPath,
    args: [resolveMarkCli(), ...args],
  };

  if (input.cwd !== undefined) shellInput.cwd = input.cwd;
  if (input.timeout !== undefined) shellInput.timeout = input.timeout;

  // Call shell.run
  const result = await ctx.client.call<
    typeof shellInput,
    {
      exitCode: number;
      stdout: string;
      stderr: string;
      signal?: string | undefined;
    }
  >(["shell", "run"], shellInput);

  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    success: result.exitCode === 0,
    duration: Date.now() - startTime,
  };
}

/**
 * Run a mark CLI command
 *
 *
 * @example
 * // Equivalent to: mark lib new my-package
 * await client.call(["cli", "run"], {
 *   path: ["lib", "new"],
 *   positional: ["my-package"],
 * });
 *
 * @example
 * // Equivalent to: mark procedure new fs.read --description "Read a file"
 * await client.call(["cli", "run"], {
 *   path: ["procedure", "new"],
 *   positional: ["fs.read"],
 *   args: { description: "Read a file" },
 * });
 */
export async function cliRun(
  input: CliRunInput,
  ctx: ProcedureContext
): Promise<CliRunOutput> {
  const startTime = Date.now();

  try {
    // Always through the mark CLI. Before, a second path sent the input straight to a running
    // CLI server, without mark's argument mapping, so the two paths gave different results
    // (a "dry run" wrote files), and it had its own copy of the lockfile logic (deep dive CLI-12).
    return await shellExecution(input, ctx, startTime);
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
