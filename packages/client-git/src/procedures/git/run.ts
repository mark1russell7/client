/**
 * How the git procedures run git: through `runCommand` of client-shell (roadmap 2.2).
 *
 * Before, they called `execFileSync`: each git call blocked the event loop of the host (an MCP
 * server or a warm `mark` server stopped all its other calls), and the signal of the call could
 * not stop git. Now each call is async, the signal kills git, and the output has a limit.
 */

import { runCommand } from "@procedures/shell/command";
import { GIT_MAX_BUFFER } from "./args.js";
import { confinedGitCommand, currentGitRoot } from "./root.js";

/** The part of the procedure context that the git procedures read. */
export interface GitContext {
  signal?: AbortSignal | undefined;
}

export interface GitRunOptions extends GitContext {
  cwd?: string | undefined;
  /** Text to write to the stdin of git (for example a patch for `git apply`). */
  input?: string | undefined;
  /** Environment variables to add for git (for example `GIT_EDITOR`). */
  env?: Record<string, string> | undefined;
}

/** A git command that ended with an exit code other than 0. */
export class GitError extends Error {
  constructor(
    readonly args: readonly string[],
    readonly exitCode: number,
    readonly stdout: string,
    readonly stderr: string,
  ) {
    super(`git ${args.join(" ")} failed (exit ${exitCode}): ${(stderr || stdout).trim()}`);
    this.name = "GitError";
  }
}

/**
 * This function runs `git <args>` and gives its stdout. It throws a `GitError` when git fails,
 * and an `AbortError` when the signal aborts. In the handler of a git procedure under a root
 * (`underGitRoot()`), git stays in the root: `confinedGitCommand()` of `root.ts`.
 */
export async function git(args: string[], options: GitRunOptions = {}): Promise<string> {
  const root = currentGitRoot();
  const command = root === undefined ? { args, cwd: options.cwd, env: options.env } : await confinedGitCommand(root, args, options.cwd, options.env);
  const result = await runCommand("git", {
    args: command.args,
    cwd: command.cwd,
    signal: options.signal,
    input: options.input,
    env: command.env,
    maxOutputBytes: GIT_MAX_BUFFER,
  });
  if (result.aborted) {
    const error = new Error(`git ${args[0]} was aborted`);
    error.name = "AbortError";
    throw error;
  }
  if (result.error) {
    throw new Error(`git did not start: ${result.error}`);
  }
  if (result.truncated?.stdout) {
    throw new Error(`The output of git ${args[0]} is longer than ${GIT_MAX_BUFFER} bytes`);
  }
  if (!result.success) {
    throw new GitError(args, result.exitCode, result.stdout, result.stderr);
  }
  return result.stdout;
}

/** This function splits output that git wrote with `-z` into its fields. */
export function zFields(output: string): string[] {
  const fields = output.split("\0");
  if (fields.at(-1) === "") fields.pop();
  return fields;
}
