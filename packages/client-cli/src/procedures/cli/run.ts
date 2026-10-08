/**
 * cli.run procedure
 *
 * Wraps the mark CLI as a procedure using client-shell.
 * Supports connecting to running CLI server for lower latency.
 * This allows calling any mark CLI command programmatically.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PROCEDURE_REGISTRY } from "@mark1russell7/client";
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
  const [service, ...rest] = input.path;
  if (!service) return null;

  let endpoint: string;
  try {
    const lockfile = await readLockfile();
    if (!lockfile) return null;
    if (!(await isServerAlive(lockfile))) return null;
    endpoint = lockfile.endpoint;
  } catch {
    // No usable server - fall through to shell execution
    return null;
  }

  // The server is up. From here on, report its errors instead of falling back to shell
  // execution: a procedure that failed on the server may already have had side effects,
  // and running it again locally would repeat them.
  try {
    // Dynamic import to avoid bundling HTTP client unnecessarily
    const { Client, HttpTransport } = await import("@mark1russell7/client");

    const transport = new HttpTransport({ baseUrl: endpoint });
    const client = new Client({ transport });

    const method = { service, operation: rest.join(".") };
    const result = await client.call(method, buildProcedureInput(input));

    return {
      exitCode: 0,
      stdout: typeof result === "string" ? result : JSON.stringify(result, null, 2),
      stderr: "",
      success: true,
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

/**
 * The positional field names of a procedure (its meta.args), as mark's CLI parser reads them.
 * A procedure that is not in the local registry keeps the old behavior: the first positional is "name".
 */
function positionalFields(path: string[]): string[] {
  const args = (PROCEDURE_REGISTRY.get(path)?.metadata as { args?: unknown } | undefined)?.args;
  if (Array.isArray(args) && args.every((a) => typeof a === "string")) {
    return args as string[];
  }
  return ["name"];
}

/**
 * Build procedure input from CLI input
 */
function buildProcedureInput(input: CliRunInput): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Map positional args to the procedure's positional fields
  const positional = input.positional ?? [];
  const fields = positionalFields(input.path);
  positional.forEach((value, i) => {
    const field = fields[i];
    if (field !== undefined) {
      result[field] = value;
    }
  });
  if (positional.length > fields.length) {
    result["_positional"] = positional;
  }

  // Add named args
  if (input.args) {
    Object.assign(result, input.args);
  }

  return result;
}

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
