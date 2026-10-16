/**
 * The way every pnpm procedure runs pnpm: an argument list through `shell.run`, no shell.
 *
 * Before, each procedure joined its arguments into one string for `shell.exec`, which runs a
 * shell, so a package name such as `x & calc` ran a second command (deep dive WRP-5).
 *
 * On Windows, `pnpm` is often a `.cmd` file, and Node runs a `.cmd` file only through a shell.
 * So the helper finds the real program: a `pnpm.exe` (the standalone pnpm), or the `pnpm.cjs`
 * script that the `.cmd` file starts, run with Node.
 */

import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import type { ProcedureContext } from "@procedures/client";
import type { PnpmCommandOutput, PnpmJsonOutput } from "../../types.js";

/** A value that pnpm reads as an argument (a package, a script, a path): it must not start with "-". */
export function pnpmArg(name: string, value: string): string {
  if (value.startsWith("-")) {
    throw new Error(`Invalid ${name} (starts with "-"): ${value}`);
  }
  return value;
}

/** The selection of the workspace packages of a command (roadmap R41). */
export interface PnpmSelection {
  filter?: string[] | undefined;
  recursive?: boolean | undefined;
}

/**
 * The selection options, before the command: `--filter=<selector>` for each selector, and
 * `--recursive`. With "=", pnpm reads each selector as the value of `--filter`, also when it
 * starts with "-" or "!".
 */
export function selectionArgs(input: PnpmSelection): string[] {
  const args = (input.filter ?? []).map((selector) => `--filter=${selector}`);
  if (input.recursive) args.push("--recursive");
  return args;
}

/** The program and the first arguments that start pnpm without a shell. */
export function resolvePnpm(): { command: string; prefix: string[] } {
  // When pnpm runs this process, npm_execpath is its script, or its executable from pnpm 12 on
  const execPath = process.env["npm_execpath"];
  if (execPath && /pnpm\.c?js$/.test(execPath) && existsSync(execPath)) {
    return { command: process.execPath, prefix: [execPath] };
  }
  if (execPath && /(^|[\\/])pnpm(\.exe)?$/i.test(execPath) && existsSync(execPath)) {
    return { command: execPath, prefix: [] };
  }
  if (process.platform !== "win32") {
    return { command: "pnpm", prefix: [] };
  }
  for (const dir of (process.env["PATH"] ?? "").split(delimiter)) {
    if (!dir) continue;
    if (existsSync(join(dir, "pnpm.exe"))) {
      return { command: join(dir, "pnpm.exe"), prefix: [] };
    }
    const script = join(dir, "node_modules", "pnpm", "bin", "pnpm.cjs");
    if (existsSync(script)) {
      return { command: process.execPath, prefix: [script] };
    }
  }
  throw new Error(`pnpm was not found: install pnpm, or run this from a pnpm script (npm_execpath: ${execPath ?? "not set"})`);
}

/** This function runs `pnpm <args>` and gives its result. It does not throw for a failed command. */
export async function runPnpm(
  args: string[],
  input: { cwd?: string | undefined; timeout?: number | undefined },
  ctx: ProcedureContext
): Promise<PnpmCommandOutput> {
  const startTime = Date.now();
  try {
    const pnpm = resolvePnpm();
    const shellInput: { command: string; args: string[]; cwd?: string; timeout?: number } = {
      command: pnpm.command,
      args: [...pnpm.prefix, ...args],
    };
    if (input.cwd !== undefined) shellInput.cwd = input.cwd;
    if (input.timeout !== undefined) shellInput.timeout = input.timeout;

    const result = await ctx.client.call<
      typeof shellInput,
      { exitCode: number; stdout: string; stderr: string }
    >(["shell", "run"], shellInput);

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

/**
 * This function runs `pnpm <args>` for a command that writes JSON, and gives `data`: the parsed
 * standard output. Output that is not JSON gives no `data`. It does not throw.
 */
export async function runPnpmJson(
  args: string[],
  input: { cwd?: string | undefined; timeout?: number | undefined },
  ctx: ProcedureContext
): Promise<PnpmJsonOutput> {
  const result: PnpmJsonOutput = await runPnpm(args, input, ctx);
  const text = result.stdout.trim();
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      result.data = JSON.parse(text);
    } catch {
      // Not JSON: stdout has the text
    }
  }
  return result;
}
