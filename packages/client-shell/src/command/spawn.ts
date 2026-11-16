/**
 * Start a child process the one way the helpers allow: an argument list, no shell, no window.
 */

import { spawn, type ChildProcess, type SpawnOptions as NodeSpawnOptions } from "node:child_process";
import { nameStartErrors, startFile } from "./program.js";
import { OWN_PROCESS_GROUP, track } from "./tree-kill.js";

export interface SpawnOptions {
  /** The arguments. Each one goes to the program as it is: no shell reads it. */
  args?: readonly string[] | undefined;
  /** The working directory (default: the current directory of the host). */
  cwd?: string | undefined;
  /** Environment variables to add to the environment of the host. */
  env?: Record<string, string | undefined> | undefined;
  /**
   * On Windows, pass the arguments without quotes. Only `shell.exec` sets it, for the command
   * line of `cmd.exe`.
   */
  windowsVerbatimArguments?: boolean | undefined;
}

/**
 * This function starts `command` with `shell: false` and `windowsHide`. On POSIX the child gets
 * its own process group, so `killTree` reaches its descendants. The child is recorded until it
 * ends, so the end of the host kills it.
 *
 * On Windows, a command with no folder starts from a folder of `PATH` only (`startFile`), never
 * from the working folder. When no folder of `PATH` has it, the start fails with ENOENT, as for
 * a missing program. The error names the command, as before.
 */
export function startChild(command: string, options: SpawnOptions, stdin: "pipe" | "ignore"): ChildProcess {
  const env = options.env ? { ...process.env, ...options.env } : process.env;
  const file = startFile(command, env);
  const spawnOptions: NodeSpawnOptions = {
    cwd: options.cwd,
    env,
    shell: false,
    windowsHide: true,
    detached: OWN_PROCESS_GROUP,
    stdio: [stdin, "pipe", "pipe"],
    // The program gets the name of the call as its first argument, as before
    argv0: command,
    ...(options.windowsVerbatimArguments ? { windowsVerbatimArguments: true } : {}),
  };
  const args = [...(options.args ?? [])];
  const child = spawn(file, args, spawnOptions);
  nameStartErrors(child, command, file);
  track(child);
  return child;
}

/** The text of an error that kept a program from starting, for example `spawn x ENOENT`. */
export function startError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
