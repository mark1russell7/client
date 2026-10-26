/**
 * The way every pnpm procedure runs pnpm: an argument list through `shell.run`, no shell. The
 * runner is `defineCliTool()` of `@procedures/shell/cli`.
 *
 * Before, each procedure joined its arguments into one string for `shell.exec`, which runs a
 * shell, so a package name such as `x & calc` ran a second command (deep dive WRP-5).
 *
 * On Windows, `pnpm` is often a `.cmd` file, and Node runs a `.cmd` file only through a shell.
 * So the helper finds the real program: a `pnpm.exe` (the standalone pnpm), or the `pnpm.cjs`
 * script that the `.cmd` file starts, run with Node.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ProcedureContext } from "@procedures/client";
import { defineCliTool, execPathProgram, findInPath, nodeScript, parseJsonDocument } from "@procedures/shell/cli";
import type { PnpmCommandOutput, PnpmJsonOutput } from "../../types.js";

/** A value that pnpm reads as an argument (a package, a script, a path): it must not start with "-". */
export function pnpmArg(name: string, value: string): string {
  return pnpm.arg(name, value);
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
  const fromExecPath = execPathProgram({ script: /pnpm\.c?js$/, executable: /(^|[\\/])pnpm(\.exe)?$/i });
  if (fromExecPath) return fromExecPath;
  if (process.platform !== "win32") {
    return { command: "pnpm", prefix: [] };
  }
  const found = findInPath((dir) => {
    if (existsSync(join(dir, "pnpm.exe"))) return { command: join(dir, "pnpm.exe"), prefix: [] };
    const script = join(dir, "node_modules", "pnpm", "bin", "pnpm.cjs");
    return existsSync(script) ? nodeScript(script) : undefined;
  });
  if (found) return found;
  const execPath = process.env["npm_execpath"];
  throw new Error(`pnpm was not found: install pnpm, or run this from a pnpm script (npm_execpath: ${execPath ?? "not set"})`);
}

/** The runner of pnpm. It finds pnpm at each command. */
const pnpm = defineCliTool({ name: "pnpm", resolve: resolvePnpm });

/** This function runs `pnpm <args>` and gives its result. It does not throw for a failed command. */
export async function runPnpm(
  args: string[],
  input: { cwd?: string | undefined; timeout?: number | undefined },
  ctx: ProcedureContext
): Promise<PnpmCommandOutput> {
  return pnpm.run(args, { cwd: input.cwd, timeout: input.timeout }, ctx);
}

/** The JSON of a pnpm output: a document that starts with "{" or "[". Other output gives undefined. */
function parsePnpmJson(stdout: string): unknown {
  const text = stdout.trim();
  return text.startsWith("{") || text.startsWith("[") ? parseJsonDocument(text) : undefined;
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
  return pnpm.runJson(args, { cwd: input.cwd, timeout: input.timeout }, ctx, parsePnpmJson);
}
