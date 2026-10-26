/**
 * The way every npm procedure runs npm: an argument list through `shell.run`, no shell. The
 * runner is `defineCliTool()` of `@procedures/shell/cli`.
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
import { defineCliTool, execPathProgram, nodeScript, parseJsonDocument } from "@procedures/shell/cli";
import type { NpmCommandOutput, NpmJsonOutput } from "../../types.js";

/** A name that npm reads as a value (a package, a field, a tag): it must not start with "-". */
export function npmArg(name: string, value: string): string {
  return npm.arg(name, value);
}

/** The program and the first arguments that start npm without a shell. */
export function resolveNpm(): { command: string; prefix: string[] } {
  // When npm runs this process, npm_execpath is its script
  const fromExecPath = execPathProgram({ script: /npm-cli\.c?js$/ });
  if (fromExecPath) return fromExecPath;
  // The npm that comes with this Node: next to node.exe on Windows, in lib/ on POSIX
  const nodeDir = dirname(process.execPath);
  for (const script of [
    join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js"),
    join(nodeDir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
  ]) {
    if (existsSync(script)) return nodeScript(script);
  }
  if (process.platform !== "win32") {
    return { command: "npm", prefix: [] };
  }
  throw new Error("npm was not found: install Node.js with npm");
}

/** The runner of npm. It finds npm at each command. */
const npm = defineCliTool({ name: "npm", resolve: resolveNpm });

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
  return npm.run(args, { cwd: input.cwd, timeout: input.timeout }, ctx);
}

/** The parsed JSON of a standard output, or undefined when it is not JSON. */
export const parseJson: (stdout: string) => unknown = parseJsonDocument;

/**
 * This function runs `npm <args>` for a command that writes JSON (`--json`), and gives `data`:
 * the parsed standard output. It does not throw.
 */
export async function runNpmJson(
  args: string[],
  input: { cwd?: string | undefined; timeout?: number | undefined },
  ctx: ProcedureContext
): Promise<NpmJsonOutput> {
  return npm.runJson(args, { cwd: input.cwd, timeout: input.timeout }, ctx);
}
