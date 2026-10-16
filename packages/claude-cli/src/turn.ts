/**
 * One turn of the Claude Code CLI as a process that can outlive its host.
 *
 * - `startTurn` starts `claude -p --output-format stream-json --verbose` as a detached process.
 *   The prompt comes from a file, and the output goes to a file. The host holds no pipe to the
 *   process, so a restart of the host does not stop the turn.
 * - `readTurn` and `followTurn` read the output file from a byte offset, and give normalised
 *   events. A new host continues from the last offset.
 * - `cancelTurn` stops the process tree of a turn by its process id.
 */

import { spawn, type SpawnOptions } from "node:child_process";
import { closeSync, mkdirSync, mkdtempSync, openSync, readSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { runCommand, type CommandOptions, type CommandResult } from "@procedures/shell/command";
import { normalizeLine, type ClaudeEvent } from "./events.js";
import { CLAUDE_ENV, findClaude } from "./executable.js";

/** The flags that make the CLI run one turn and write stream-json. */
export const CLAUDE_FLAGS: readonly string[] = ["-p", "--output-format", "stream-json", "--verbose"];

/** The part of a child process that `startTurn` uses. */
export interface SpawnedProcess {
  readonly pid?: number | undefined;
  once(event: "spawn" | "error", listener: (error?: Error) => void): unknown;
  unref(): void;
}

/** The function that starts a process. The default is `spawn` of `node:child_process`. */
export type Spawner = (command: string, args: readonly string[], options: SpawnOptions) => SpawnedProcess;

const defaultSpawner: Spawner = (command, args, options) => spawn(command, [...args], options);

/** The options of `startTurn`. */
export interface StartTurnOptions {
  /** The prompt. The process reads it from a file on its stdin. */
  readonly prompt: string;
  /** The working folder of the turn (default: the current folder). */
  readonly cwd?: string | undefined;
  /** More arguments after the default flags, for example `--resume <session>` or `--model <name>`. */
  readonly args?: readonly string[] | undefined;
  /** The file that gets the output. The process appends to it. The default is a file in a new temporary folder. */
  readonly outputFile?: string | undefined;
  /** The file that holds the prompt (default: `<outputFile>.prompt.txt`). */
  readonly promptFile?: string | undefined;
  /** The `claude` program (default: `CLAUDE_BIN` of the host, then a search). */
  readonly executable?: string | undefined;
  /** The arguments before the default flags, for example the path of `cli.js` when `executable` is `node`. */
  readonly executableArgs?: readonly string[] | undefined;
  /** The full environment of the process (default: `process.env`). The caller removes the secrets. */
  readonly env?: Readonly<Record<string, string | undefined>> | undefined;
  /** The function that starts the process (default: `spawn`). The tests give their own. */
  readonly spawner?: Spawner | undefined;
}

/** A turn that runs. Keep `pid`, `outputFile` and `offset` to read or stop the turn later. */
export interface StartedTurn {
  readonly pid: number;
  /** The absolute path of the output file. */
  readonly outputFile: string;
  /** The absolute path of the prompt file. */
  readonly promptFile: string;
  /** The byte offset in the output file where the output of this turn starts. */
  readonly offset: number;
  /** The program and its arguments. */
  readonly command: string;
  readonly args: readonly string[];
  /** The start time, as an ISO 8601 text. */
  readonly startedAt: string;
}

/** True when the program is a batch file of Windows, which does not start without a shell. */
function isBatchFile(program: string): boolean {
  return /\.(cmd|bat)$/i.test(program);
}

function sizeOf(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

/**
 * This function starts one turn as a detached process: stdin is the prompt file, stdout and
 * stderr go to the output file. The process starts with argv, not through a shell.
 */
export async function startTurn(options: StartTurnOptions): Promise<StartedTurn> {
  // The search reads the environment of the host, not the environment of the turn
  const command = findClaude({ executable: options.executable });
  if (command === undefined) throw new Error(`The claude program was not found. Install Claude Code, or set ${CLAUDE_ENV} to the program.`);
  if (process.platform === "win32" && isBatchFile(command)) {
    throw new Error(`${command} is a batch file, which does not start without a shell. Give the native claude.exe, or node and the path of cli.js.`);
  }
  const outputFile = resolve(options.outputFile ?? join(mkdtempSync(join(tmpdir(), "claude-turn-")), "output.ndjson"));
  const promptFile = resolve(options.promptFile ?? `${outputFile}.prompt.txt`);
  mkdirSync(dirname(outputFile), { recursive: true });
  mkdirSync(dirname(promptFile), { recursive: true });
  writeFileSync(promptFile, options.prompt, "utf8");
  const offset = sizeOf(outputFile);
  const args = [...(options.executableArgs ?? []), ...CLAUDE_FLAGS, ...(options.args ?? [])];

  const input = openSync(promptFile, "r");
  const output = openSync(outputFile, "a");
  try {
    const child = (options.spawner ?? defaultSpawner)(command, args, {
      cwd: options.cwd,
      env: { ...(options.env ?? process.env) },
      // Its own process group on POSIX (the cancel signals the group), and no console window
      detached: true,
      windowsHide: true,
      shell: false,
      stdio: [input, output, output],
    });
    await new Promise<void>((resolveStart, rejectStart) => {
      child.once("spawn", () => resolveStart());
      child.once("error", (error) => rejectStart(new Error(`claude did not start: ${error?.message ?? "unknown error"}`)));
    });
    if (child.pid === undefined) throw new Error("claude did not start: no process id");
    child.unref();
    return { pid: child.pid, outputFile, promptFile, offset, command, args, startedAt: new Date().toISOString() };
  } finally {
    // The process has its own copies of the two files
    closeSync(input);
    closeSync(output);
  }
}

/** This function tells if a process with this id runs. */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process runs, but it belongs to another user
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** One event of a turn, with the byte offset after its line. Give that offset to continue. */
export interface TurnEvent {
  readonly offset: number;
  readonly event: ClaudeEvent;
}

/** The options of `readTurn`. */
export interface ReadTurnOptions {
  /** The output file of the turn. */
  readonly outputFile: string;
  /** The byte offset to start from (default: 0). */
  readonly offset?: number | undefined;
  /** The process id of the turn. Without it, the last line without a line end stays unread. */
  readonly pid?: number | undefined;
  /** The function that tells if a process runs (default: `isProcessAlive`). */
  readonly isAlive?: ((pid: number) => boolean) | undefined;
}

/** The result of `readTurn`. */
export interface ReadTurnResult {
  readonly events: TurnEvent[];
  /** The byte offset after the last line that was read. Give it to the next read. */
  readonly offset: number;
  /** True when the events include the `result` of the turn. */
  readonly finished: boolean;
  /** True when the process runs. It is absent without `pid`. */
  readonly running?: boolean;
  /** The number of new bytes in the file, read or not. */
  readonly newBytes: number;
}

function readBytes(path: string, start: number, end: number): Buffer {
  const fd = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(end - start);
    let done = 0;
    while (done < buffer.length) {
      const read = readSync(fd, buffer, done, buffer.length - done, start + done);
      if (read === 0) break;
      done += read;
    }
    return buffer.subarray(0, done);
  } finally {
    closeSync(fd);
  }
}

/**
 * This function reads the complete lines of the output file after `offset`, and normalises them.
 * When the process has ended, it also reads a last line without a line end.
 */
export function readTurn(options: ReadTurnOptions): ReadTurnResult {
  const start = options.offset ?? 0;
  // The check comes before the read: when the process has ended, the file is complete
  const running = options.pid === undefined ? undefined : (options.isAlive ?? isProcessAlive)(options.pid);
  const status = running === undefined ? {} : { running };
  const size = sizeOf(options.outputFile);
  if (size <= start) return { events: [], offset: start, finished: false, newBytes: 0, ...status };

  const bytes = readBytes(options.outputFile, start, size);
  const events: TurnEvent[] = [];
  let position = 0;
  let finished = false;
  while (position < bytes.length) {
    let end = bytes.indexOf(0x0a, position);
    if (end === -1) {
      if (running !== false) break;
      end = bytes.length;
    }
    const line = bytes.subarray(position, end).toString("utf8");
    position = Math.min(end + 1, bytes.length);
    for (const event of normalizeLine(line)) {
      events.push({ offset: start + position, event });
      if (event.type === "result") finished = true;
    }
  }
  return { events, offset: start + position, finished, newBytes: bytes.length, ...status };
}

/** The options of `followTurn`. */
export interface FollowTurnOptions extends ReadTurnOptions {
  /** The time between two reads, in milliseconds (default: 250). */
  readonly pollMs?: number | undefined;
  /** The reads without new bytes after the end of the process, before the follow stops (default: 2). */
  readonly quietReads?: number | undefined;
  /** When the signal aborts, the follow stops. The process continues. */
  readonly signal?: AbortSignal | undefined;
}

/**
 * This function follows the output file and gives each event while the turn runs. It stops after
 * the `result` event. When the process ends without a result, it gives an `error` event and stops.
 * Without `pid`, only the result or the signal stops it.
 */
export async function* followTurn(options: FollowTurnOptions): AsyncGenerator<TurnEvent, void, undefined> {
  const pollMs = options.pollMs ?? 250;
  const quietLimit = options.quietReads ?? 2;
  let offset = options.offset ?? 0;
  let quiet = 0;
  while (options.signal?.aborted !== true) {
    const read = readTurn({ ...options, offset });
    for (const item of read.events) {
      yield item;
      if (item.event.type === "result") return;
    }
    offset = read.offset;
    if (read.running === false) {
      quiet = read.newBytes > 0 ? 0 : quiet + 1;
      if (quiet >= quietLimit) {
        yield { offset, event: { type: "error", message: "The process ended without a result" } };
        return;
      }
    }
    try {
      await sleep(pollMs, undefined, options.signal ? { signal: options.signal } : undefined);
    } catch {
      return;
    }
  }
}

/** The function that runs a program. The default is `runCommand` of `@procedures/shell`. */
export type CommandRunner = (command: string, options: CommandOptions) => Promise<CommandResult>;

/** The options of `cancelTurn`. Each one has a default from the host. */
export interface CancelTurnOptions {
  /** The operating system (default: `process.platform`). */
  readonly platform?: NodeJS.Platform | undefined;
  /** The function that runs `taskkill` on Windows (default: `runCommand`). */
  readonly runner?: CommandRunner | undefined;
  /** The function that sends a signal on POSIX (default: `process.kill`). */
  readonly kill?: ((pid: number, signal: NodeJS.Signals) => void) | undefined;
  /** The function that tells if a process runs (default: `isProcessAlive`). */
  readonly isAlive?: ((pid: number) => boolean) | undefined;
  /** The signal on POSIX (default: `SIGTERM`). */
  readonly signal?: NodeJS.Signals | undefined;
}

/** The result of `cancelTurn`. */
export interface CancelTurnResult {
  /** True when the stop reached the process. */
  readonly stopped: boolean;
  /** Why the stop did not occur, when `stopped` is false. */
  readonly reason?: string;
}

/**
 * This function stops the process tree of a turn. On Windows it starts `taskkill /T /F /PID`.
 * On POSIX it signals the process group, which `startTurn` made. It refuses the id of the host.
 */
export async function cancelTurn(pid: number, options: CancelTurnOptions = {}): Promise<CancelTurnResult> {
  if (!Number.isSafeInteger(pid) || pid <= 1) throw new Error(`cancelTurn refuses the process id ${pid}`);
  if (pid === process.pid || pid === process.ppid) throw new Error("cancelTurn refuses the process of the host");
  if (!(options.isAlive ?? isProcessAlive)(pid)) return { stopped: false, reason: "The process has ended" };

  if ((options.platform ?? process.platform) === "win32") {
    const result = await (options.runner ?? runCommand)("taskkill", { args: ["/T", "/F", "/PID", String(pid)], timeout: 30_000 });
    if (result.exitCode === 0) return { stopped: true };
    return { stopped: false, reason: (result.error ?? result.stderr.trim()) || `taskkill gave the exit code ${result.exitCode}` };
  }
  const kill = options.kill ?? ((target: number, signal: NodeJS.Signals): void => void process.kill(target, signal));
  const signal = options.signal ?? "SIGTERM";
  try {
    // The negative id signals the process group: the turn and the programs that it started
    kill(-pid, signal);
    return { stopped: true };
  } catch {
    try {
      kill(pid, signal);
      return { stopped: true };
    } catch (error) {
      return { stopped: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }
}
