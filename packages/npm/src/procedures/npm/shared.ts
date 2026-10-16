/**
 * The way every npm procedure runs npm: an argument list through `shell.run`, no shell.
 *
 * On Windows, `npm` is a `.cmd` file, and Node runs a `.cmd` file only through a shell. So the
 * helper finds the real program: the `npm-cli.js` script of the npm of this Node, run with Node.
 *
 * Each command puts its options first, then `--`, then its positional values. After `--`, npm
 * reads no option, so a package or a message that starts with "-" stays a value.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ProcedureContext } from "@procedures/client";
import type { NpmCommandOutput, NpmJsonOutput } from "../../types.js";

/** A name that npm reads as a value (a package, a field, a tag): it must not start with "-". */
export function npmArg(name: string, value: string): string {
  if (value.startsWith("-")) {
    throw new Error(`Invalid ${name} (starts with "-"): ${value}`);
  }
  return value;
}

/** The program and the first arguments that start npm without a shell. */
export function resolveNpm(): { command: string; prefix: string[] } {
  // When npm runs this process, npm_execpath is its script
  const execPath = process.env["npm_execpath"];
  if (execPath && /npm-cli\.c?js$/.test(execPath) && existsSync(execPath)) {
    return { command: process.execPath, prefix: [execPath] };
  }
  // The npm that comes with this Node: next to node.exe on Windows, in lib/ on POSIX
  const nodeDir = dirname(process.execPath);
  for (const script of [
    join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js"),
    join(nodeDir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
  ]) {
    if (existsSync(script)) return { command: process.execPath, prefix: [script] };
  }
  if (process.platform !== "win32") {
    return { command: "npm", prefix: [] };
  }
  throw new Error("npm was not found: install Node.js with npm");
}

/** `--registry=<url>` and `--otp=<code>`: with "=", npm reads the value as the value of the option. */
export function accountOptions(input: { registry?: string | undefined; otp?: string | undefined }): string[] {
  const args: string[] = [];
  if (input.registry !== undefined) args.push(`--registry=${input.registry}`);
  if (input.otp !== undefined) args.push(`--otp=${input.otp}`);
  return args;
}

/** This function runs `npm <args>` and gives its result. It does not throw for a failed command. */
export async function runNpm(
  args: string[],
  input: { cwd?: string | undefined; timeout?: number | undefined },
  ctx: ProcedureContext
): Promise<NpmCommandOutput> {
  const startTime = Date.now();
  try {
    const npm = resolveNpm();
    const shellInput: { command: string; args: string[]; cwd?: string; timeout?: number } = {
      command: npm.command,
      args: [...npm.prefix, ...args],
    };
    if (input.cwd !== undefined) shellInput.cwd = input.cwd;
    if (input.timeout !== undefined) shellInput.timeout = input.timeout;

    const result = await ctx.client.call<typeof shellInput, { exitCode: number; stdout: string; stderr: string }>(
      ["shell", "run"],
      shellInput
    );
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

/** The parsed JSON of a standard output, or undefined when it is not JSON. */
export function parseJson(stdout: string): unknown {
  const text = stdout.trim();
  if (text === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * This function runs `npm <args>` for a command that writes JSON (`--json`), and gives `data`:
 * the parsed standard output. It does not throw.
 */
export async function runNpmJson(
  args: string[],
  input: { cwd?: string | undefined; timeout?: number | undefined },
  ctx: ProcedureContext
): Promise<NpmJsonOutput> {
  const result: NpmJsonOutput = await runNpm(args, input, ctx);
  const data = parseJson(result.stdout);
  if (data !== undefined) result.data = data;
  return result;
}
