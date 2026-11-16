/**
 * Start a child process the one way the helpers allow: an argument list, no shell, no window.
 */

import {
  spawn,
  spawnSync,
  type ChildProcess,
  type SpawnOptions as NodeSpawnOptions,
  type SpawnSyncOptions,
  type SpawnSyncOptionsWithBufferEncoding,
  type SpawnSyncOptionsWithStringEncoding,
  type SpawnSyncReturns,
} from "node:child_process";
import { nameStartError, nameStartErrors, startFile } from "./program.js";
import { OWN_PROCESS_GROUP, killTree, track } from "./tree-kill.js";

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

/** The options of `spawnProgram`: the options of `spawn` of Node, without `shell`. */
export type ProgramSpawnOptions = Omit<NodeSpawnOptions, "shell">;

/**
 * This function starts a program for a caller that keeps the child: for example a detached
 * process, or a process with files as its standard input and output. Each other package of this
 * repository starts a program through this function, `spawnProgramSync`, `runCommand`,
 * `streamCommand` or `processes`: the import rule `program-start-outside-shell` holds it.
 *
 * - On Windows, a command with no folder starts from a folder of `PATH` only (`startFile`), never
 *   from the working folder. When no folder of `PATH` has it, the start fails with ENOENT.
 * - No shell reads the arguments: the option `shell` is always `false`, because a shell has its
 *   own lookup of a program.
 * - The default of `windowsHide` is `true`. The program gets the name of the call as its first
 *   argument (`argv0`).
 * - The error of a failed start names the command, as for a start by name.
 *
 * Unlike `startChild`, the function does not record the child, so the end of the host does not
 * stop it. The caller decides when the child stops.
 */
export function spawnProgram(command: string, args: readonly string[], options: ProgramSpawnOptions = {}): ChildProcess {
  const file = startFile(command, options.env ?? process.env);
  const child = spawn(file, [...args], { argv0: command, windowsHide: true, ...options, shell: false });
  nameStartErrors(child, command, file);
  return child;
}

/**
 * This function starts a program and waits for its end, as `spawnSync` of Node does. It finds
 * the program as `spawnProgram` does: on Windows only in the folders of `PATH`, with no shell. The
 * error of a failed start (`result.error`) names the command.
 */
export function spawnProgramSync(command: string, args: readonly string[], options: Omit<SpawnSyncOptionsWithStringEncoding, "shell">): SpawnSyncReturns<string>;
export function spawnProgramSync(command: string, args: readonly string[], options?: Omit<SpawnSyncOptionsWithBufferEncoding, "shell">): SpawnSyncReturns<Buffer>;
export function spawnProgramSync(command: string, args: readonly string[], options?: Omit<SpawnSyncOptions, "shell">): SpawnSyncReturns<string | Buffer>;
export function spawnProgramSync(command: string, args: readonly string[], options: Omit<SpawnSyncOptions, "shell"> = {}): SpawnSyncReturns<string | Buffer> {
  const file = startFile(command, options.env ?? process.env);
  const result = spawnSync(file, [...args], { argv0: command, windowsHide: true, ...options, shell: false });
  if (result.error !== undefined) nameStartError(result.error, command, file, "spawnSync");
  return result;
}

/**
 * The time in milliseconds that the output pipes get after the end of the child, at a time limit,
 * an abort or a stop. The data in the pipes arrives in this time.
 */
const PIPE_DRAIN_MS = 250;

/**
 * This function ends a command at its time limit, its abort or its stop. It kills the process
 * tree. After the end of the child, the output pipes get `PIPE_DRAIN_MS`, then the function
 * closes them. Thus a descendant that keeps the pipes (a process outside the group of the child,
 * or each descendant on Windows) does not hold the command. The `close` event of the child follows.
 */
export function endCommand(child: ChildProcess, signal: NodeJS.Signals = "SIGTERM"): void {
  killTree(child, signal);
  const closePipes = (): void => {
    const timer = setTimeout(() => {
      child.stdout?.destroy();
      child.stderr?.destroy();
    }, PIPE_DRAIN_MS);
    timer.unref();
    child.once("close", () => clearTimeout(timer));
  };
  if (child.exitCode !== null || child.signalCode !== null) closePipes();
  else child.once("exit", closePipes);
}

/** The text of an error that kept a program from starting, for example `spawn x ENOENT`. */
export function startError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
