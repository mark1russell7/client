/**
 * The way every gh procedure runs the GitHub CLI: an argument list through `shell.run`, no
 * shell. The runner is `defineCliTool()` of `@procedures/shell/cli`. A value that gh reads as an
 * argument must not start with "-", so it cannot become an option. The output is the JSON of
 * `--json` where gh has it.
 */

import { devNull } from "node:os";
import type { ProcedureContext } from "@procedures/client";
import { defineCliTool, type CliRunOptions } from "@procedures/shell/cli";
import type { GhCommonInput } from "../../types.js";

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

/** The runner of gh. A failed command is a GhError. */
const gh = defineCliTool({ name: "gh", error: (message, exitCode, stderr) => new GhError(message, exitCode, stderr) });

/** A value that gh reads as an argument (a branch, a tag, a title): it must not start with "-". */
export function ghArg(name: string, value: string): string {
  return gh.arg(name, value);
}

/** The option `--repo owner/name`, when the input gives a repository. */
export function repoArgs(input: GhCommonInput): string[] {
  return input.repo === undefined ? [] : ["--repo", ghArg("repo", input.repo)];
}

/**
 * The options of a gh command. Under a root of the files (`ctx.fsRoot`), `GIT_DIR` is the null
 * device. Then the git commands of gh find no repository, and the configuration of a repository
 * in the root starts no program.
 */
function runOptions(input: GhCommonInput, ctx: ProcedureContext, env?: Record<string, string>): CliRunOptions {
  return { cwd: input.cwd, timeout: input.timeoutMs, env: ctx.fsRoot === undefined ? env : { ...env, GIT_DIR: devNull } };
}

/**
 * This function runs `gh <args>` and gives its output. It throws a GhError for a failed command.
 * The `env` variables go to gh in addition to the environment of the host.
 */
export async function runGh(args: string[], input: GhCommonInput, ctx: ProcedureContext, env?: Record<string, string>): Promise<string> {
  return gh.output(args, runOptions(input, ctx, env), ctx);
}

/** This function runs gh with `--json` and gives the parsed value. */
export async function ghJson<T>(args: string[], input: GhCommonInput, ctx: ProcedureContext): Promise<T> {
  return gh.json<T>(args, runOptions(input, ctx), ctx);
}

/** The options of a list: its limit and a search. */
export function listArgs(input: { limit?: number | undefined; search?: string | undefined }): string[] {
  const args = ["--limit", String(input.limit ?? 30)];
  if (input.search !== undefined) args.push("--search", input.search);
  return args;
}

/**
 * This function gives the `key=value` argument of a field (`-f`, `-F`). The key cannot be empty,
 * contain "=" or start with "-".
 */
export function fieldArg(name: string, key: string, value: string): string {
  if (key.length === 0 || key.includes("=") || key.startsWith("-")) throw new Error(`Invalid ${name} name (empty, with "=", or starts with "-"): ${key}`);
  return `${key}=${value}`;
}

/** The last line of an output that is a URL: gh prints the URL of what it made. */
export function urlOf(output: string): string {
  const lines = output.trim().split(/\r?\n/);
  return lines.reverse().find((line) => line.startsWith("https://")) ?? lines[0] ?? "";
}
