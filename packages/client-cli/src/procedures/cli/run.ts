/**
 * cli.run procedure
 *
 * Wraps the mark CLI as a procedure using client-shell.
 * Supports connecting to running CLI server for lower latency.
 * This allows calling any mark CLI command programmatically.
 */

import type { ProcedureContext } from "@mark1russell7/client";
import type { CliRunInput, CliRunOutput } from "../../types.js";
import { readLockfile, isServerAlive } from "../../lockfile.js";

/**
 * Try to execute via running CLI server
 */
async function tryServerExecution(
  input: CliRunInput,
  startTime: number
): Promise<CliRunOutput | null> {
  try {
    const lockfile = await readLockfile();
    if (!lockfile) return null;

    if (!(await isServerAlive(lockfile))) return null;

    // Dynamic import to avoid bundling HTTP client unnecessarily
    const { Client, HttpTransport } = await import("@mark1russell7/client");

    const transport = new HttpTransport({
      baseUrl: lockfile.endpoint,
    });
    const client = new Client({ transport });

    // Build procedure input from CLI input
    const procedureInput = buildProcedureInput(input);

    // Convert path to method
    const [service, ...rest] = input.path;
    if (!service) return null;

    const method = { service, operation: rest.join(".") };

    // Execute remotely
    const result = await client.call(method, procedureInput);

    return {
      exitCode: 0,
      stdout: typeof result === "string" ? result : JSON.stringify(result, null, 2),
      stderr: "",
      success: true,
      duration: Date.now() - startTime,
    };
  } catch {
    // Server connection failed - fall through to shell execution
    return null;
  }
}

/**
 * Build procedure input from CLI input
 */
function buildProcedureInput(input: CliRunInput): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Add positional args as numbered keys or as specific fields based on procedure
  if (input.positional && input.positional.length > 0) {
    // For most procedures, first positional is "name"
    result["name"] = input.positional[0];
    if (input.positional.length > 1) {
      result["_positional"] = input.positional;
    }
  }

  // Add named args
  if (input.args) {
    Object.assign(result, input.args);
  }

  return result;
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
    command: "node",
    args: ["cli/dist/index.js", ...args],
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
 * First tries to connect to running CLI server for lower latency.
 * Falls back to shell execution if no server is available.
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
    // Try server execution first (lower latency if server running)
    const serverResult = await tryServerExecution(input, startTime);
    if (serverResult) {
      return serverResult;
    }

    // Fall back to shell execution
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
