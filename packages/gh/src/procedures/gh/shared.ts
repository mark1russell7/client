/**
 * The way every gh procedure runs the GitHub CLI: an argument list through `shell.run`, no
 * shell. A value that gh reads as an argument must not start with "-", so it cannot become an
 * option. The output is the JSON of `--json` where gh has it.
 */

import type { ProcedureContext } from "@procedures/client";
import type { GhCommonInput } from "../../types.js";

/** The fields of a call of shell.run. */
interface ShellRunInput {
  command: string;
  args: string[];
  cwd?: string;
  timeout?: number;
}

/** A failed gh command: its exit code and its error text. */
export class GhError extends Error {
  override readonly name = "GhError";
  constructor(
    message: string,
    readonly exitCode: number,
    readonly stderr: string,
  ) {
    super(message);
  }
}

/** A value that gh reads as an argument (a branch, a tag, a title): it must not start with "-". */
export function ghArg(name: string, value: string): string {
  if (value.startsWith("-")) throw new Error(`Invalid ${name} (starts with "-"): ${value}`);
  return value;
}

/** The option `--repo owner/name`, when the input gives a repository. */
export function repoArgs(input: GhCommonInput): string[] {
  return input.repo === undefined ? [] : ["--repo", ghArg("repo", input.repo)];
}

/** This function runs `gh <args>` and gives its output. It throws a GhError for a failed command. */
export async function runGh(args: string[], input: GhCommonInput, ctx: ProcedureContext): Promise<string> {
  const shellInput: ShellRunInput = { command: "gh", args };
  if (input.cwd !== undefined) shellInput.cwd = input.cwd;
  if (input.timeoutMs !== undefined) shellInput.timeout = input.timeoutMs;
  const result = await ctx.client.call<ShellRunInput, { exitCode: number; stdout: string; stderr: string }>(["shell", "run"], shellInput);
  if (result.exitCode !== 0) {
    const text = result.stderr.trim() || result.stdout.trim();
    throw new GhError(`gh ${args[0] ?? ""} ${args[1] ?? ""} failed (exit ${result.exitCode}): ${text}`.trim(), result.exitCode, result.stderr);
  }
  return result.stdout;
}

/** This function runs gh with `--json` and gives the parsed value. */
export async function ghJson<T>(args: string[], input: GhCommonInput, ctx: ProcedureContext): Promise<T> {
  const output = await runGh(args, input, ctx);
  try {
    return JSON.parse(output) as T;
  } catch {
    throw new GhError(`gh ${args[0] ?? ""} ${args[1] ?? ""} gave no JSON: ${output.slice(0, 200)}`, 0, "");
  }
}

/** The options of a list: its limit and a search. */
export function listArgs(input: { limit?: number | undefined; search?: string | undefined }): string[] {
  const args = ["--limit", String(input.limit ?? 30)];
  if (input.search !== undefined) args.push("--search", input.search);
  return args;
}

/** The last line of an output that is a URL: gh prints the URL of what it made. */
export function urlOf(output: string): string {
  const lines = output.trim().split(/\r?\n/);
  return lines.reverse().find((line) => line.startsWith("https://")) ?? lines[0] ?? "";
}
