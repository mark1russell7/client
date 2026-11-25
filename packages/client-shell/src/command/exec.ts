/**
 * The start of a program that gives its output and throws an error when the program fails. The two functions copy
 * `execFileSync` and the promise form of `execFile` of Node, but they start the program with `spawnProgramSync` and
 * `spawnProgram` of this module.
 *
 * Reason: on Windows, Node looks for a program name with no folder first in the working folder of the child. Thus a
 * repository that has a `git.exe` file starts that file when a script runs git in the folder of the repository.
 * `spawnProgram` finds a program only in the folders of `PATH`, and it starts no shell.
 *
 * The defaults are the defaults of Node, not of `runCommand`: `windowsHide` is false. On Windows, a hidden child of a
 * process with a console gets its own console. That is one more process (conhost.exe) for each start.
 */
import type { ChildProcess, ExecFileSyncOptions, ExecFileSyncOptionsWithBufferEncoding, ExecFileSyncOptionsWithStringEncoding, SpawnOptions as NodeSpawnOptions, SpawnSyncReturns } from "node:child_process";
import { spawnProgram, spawnProgramSync } from "./spawn.js";

/** The options of `execProgramSync`: the options of `execFileSync` of Node, with no `shell`. */
export type ExecProgramSyncOptions = Omit<ExecFileSyncOptions, "shell">;

/** The error of a program that failed. It has the fields of the result of the start, as the error of `execFileSync` has. */
export type ProgramError = Error & Partial<SpawnSyncReturns<string | Buffer>>;

/**
 * This function starts a program, waits for its end and gives its standard output, as `execFileSync` of Node does:
 * - It throws when the program does not start, exits with a code that is not 0, ends on a signal or passes its time limit.
 *   The error has the fields `status`, `signal`, `stdout` and `stderr`.
 * - With no `stdio` option, the standard error of the program goes to the standard error of this process.
 * - It finds the program as `spawnProgramSync` does: on Windows only in the folders of `PATH`, with no shell.
 */
export function execProgramSync(command: string, args: readonly string[], options: Omit<ExecFileSyncOptionsWithStringEncoding, "shell">): string;
export function execProgramSync(command: string, args: readonly string[], options?: Omit<ExecFileSyncOptionsWithBufferEncoding, "shell">): Buffer;
export function execProgramSync(command: string, args: readonly string[], options?: ExecProgramSyncOptions): string | Buffer;
export function execProgramSync(command: string, args: readonly string[], options: ExecProgramSyncOptions = {}): string | Buffer {
  const result = spawnProgramSync(command, args, { ...options, windowsHide: options.windowsHide ?? false });
  if (options.stdio === undefined && result.stderr) process.stderr.write(result.stderr);
  const error = programError(result, [command, ...args]);
  if (error) throw error;
  return result.stdout;
}

/**
 * This function gives the error of the result of a start, as `execFileSync` makes it, or undefined when the program
 * exited with 0. The words are the program and its arguments, for the text of the error.
 */
export function programError(result: SpawnSyncReturns<string | Buffer>, words: readonly string[]): ProgramError | undefined {
  if (result.error) return Object.assign(result.error, result);
  if (result.status === 0) return undefined;
  const stderr = result.stderr && result.stderr.length > 0 ? `\n${result.stderr.toString()}` : "";
  return Object.assign(new Error(`Command failed: ${words.join(" ")}${stderr}`), result);
}

/** The options of `execProgram`: the options of `execFile` of Node with no `shell`, and the text for the standard input. */
export interface ExecProgramOptions extends Omit<NodeSpawnOptions, "shell" | "stdio" | "timeout" | "killSignal"> {
  /** The text or the bytes for the standard input. The standard input closes after it, or at once when there is none. */
  readonly input?: string | Buffer | undefined;
  /** After this number of milliseconds, the program gets `killSignal`, and the call fails (default: no limit). */
  readonly timeout?: number | undefined;
  /** The signal that stops the program at the time limit or at too much output (default: SIGTERM). */
  readonly killSignal?: NodeJS.Signals | number | undefined;
  /** The maximum length of each output stream. More output stops the program, and the call fails (default: 1 MiB). */
  readonly maxBuffer?: number | undefined;
  /** The encoding of the output (default: utf8). */
  readonly encoding?: BufferEncoding | undefined;
}

/** The error of `execProgram`, with the fields of the error of `execFile`. */
export interface ExecProgramError extends Error {
  /** The exit code, or the code of the error, for example `ENOENT` or `ERR_CHILD_PROCESS_STDIO_MAXBUFFER`. */
  code?: number | string | null;
  signal?: NodeJS.Signals | null;
  /** True when this function stopped the program: at the time limit or at too much output. */
  killed?: boolean;
  /** The program and its arguments. */
  cmd?: string;
  stdout: string;
  stderr: string;
}

/** The default maximum of each output stream of `execProgram`: the default of `execFile` of Node. */
export const EXEC_MAX_BUFFER: number = 1024 * 1024;

/**
 * This function starts a program, waits for its end and gives its output, as the promise form of `execFile` of Node does.
 * The promise fails in these conditions:
 * - The program does not start.
 * - The program exits with a code that is not 0, or ends on a signal.
 * - The program passes its time limit, or writes more than `maxBuffer`.
 *
 * It finds the program as `spawnProgram` does: on Windows only in the folders of `PATH`, with no shell. The environment
 * is `env` when it is given, as for `execFile`.
 */
export function execProgram(command: string, args: readonly string[], options: ExecProgramOptions = {}): Promise<{ stdout: string; stderr: string }> {
  const { input, timeout = 0, killSignal = "SIGTERM", maxBuffer = EXEC_MAX_BUFFER, encoding = "utf8", ...spawnOptions } = options;
  const cmd = [command, ...args].join(" ");
  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawnProgram(command, args, { ...spawnOptions, windowsHide: spawnOptions.windowsHide ?? false, stdio: ["pipe", "pipe", "pipe"] });
    } catch (error) {
      reject(Object.assign(error instanceof Error ? error : new Error(String(error)), { cmd, stdout: "", stderr: "" }));
      return;
    }
    const output = { stdout: [] as Buffer[], stderr: [] as Buffer[] };
    const length = { stdout: 0, stderr: 0 };
    let failure: Error | undefined;
    let killed = false;
    let settled = false;
    const text = (name: "stdout" | "stderr"): string => Buffer.concat(output[name]).toString(encoding);
    const stop = (): void => {
      killed = true;
      try {
        child.kill(killSignal);
      } catch {
        // The program ended before the stop.
      }
    };
    const timer = timeout > 0 ? setTimeout(stop, timeout) : undefined;
    const settle = (code: number | null, signal: NodeJS.Signals | null): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      const stdout = text("stdout");
      const stderr = text("stderr");
      if (failure === undefined && code === 0 && signal === null) {
        resolve({ stdout, stderr });
        return;
      }
      const error: ExecProgramError = Object.assign(failure ?? new Error(`Command failed: ${cmd}\n${stderr}`), failure === undefined ? { code, signal } : {}, { killed, cmd, stdout, stderr });
      reject(error);
    };
    const take = (name: "stdout" | "stderr") => (part: Buffer): void => {
      if (failure !== undefined) return;
      length[name] += part.length;
      if (length[name] > maxBuffer) {
        failure = Object.assign(new RangeError(`${name} maxBuffer length exceeded`), { code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" });
        stop();
        return;
      }
      output[name].push(part);
    };
    child.stdout?.on("data", take("stdout"));
    child.stderr?.on("data", take("stderr"));
    // The program can end before it reads all the input. Then the write fails with EPIPE, and the exit code tells the result.
    child.stdin?.on("error", () => {});
    child.stdin?.end(input);
    child.on("error", (error) => {
      failure ??= error;
      settle(null, null);
    });
    child.on("close", (code, signal) => settle(code, signal));
  });
}
