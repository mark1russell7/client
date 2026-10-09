/**
 * runCommand: run a program to its end and give its output (roadmap 2.2).
 *
 * This is the one way the wrapper packages run a program. Each wrapper had its own way: shell
 * strings (`docker`, `pnpm`), synchronous calls that blocked the event loop and ignored the
 * signal (`git`, `cue`), and `spawn` calls that killed only the direct child.
 */

import { killTree } from "./tree-kill.js";
import { DEFAULT_MAX_OUTPUT_BYTES, OutputCollector } from "./output.js";
import { startChild, startError, type SpawnOptions } from "./spawn.js";

export interface CommandOptions extends SpawnOptions {
  /** Text or bytes to write to stdin. Without it, stdin is empty (the program reads its end at once). */
  input?: string | Buffer | undefined;
  /** After this many milliseconds, the process tree is killed. */
  timeout?: number | undefined;
  /** When the signal aborts, the process tree is killed. An aborted signal starts nothing. */
  signal?: AbortSignal | undefined;
  /** The most bytes kept of each output stream (default: 64 MiB). */
  maxOutputBytes?: number | undefined;
  /** Past the limit, keep the first bytes ("head", the default) or the last bytes ("tail"). */
  keep?: "head" | "tail" | undefined;
  /** The encoding of the output (default: utf8). */
  encoding?: BufferEncoding | undefined;
}

export interface CommandResult {
  /** The exit code. It is 1 when the process ended on a signal or did not start. */
  exitCode: number;
  stdout: string;
  stderr: string;
  /** True when the exit code is 0. */
  success: boolean;
  /** The time from the start to the end, in milliseconds. */
  duration: number;
  /** The signal that ended the process. When the helper killed the tree, it is "SIGTERM". */
  signal?: string;
  /** True when the timeout killed the process. */
  timedOut?: boolean;
  /** True when the signal aborted the command. */
  aborted?: boolean;
  /** Present when an output stream was longer than `maxOutputBytes`: which one lost bytes. */
  truncated?: { stdout: boolean; stderr: boolean };
  /** The error that kept the program from starting, for example `spawn x ENOENT`. */
  error?: string;
}

/** This function runs `command` with `options.args`. It does not throw: a failure is in the result. */
export function runCommand(command: string, options: CommandOptions = {}): Promise<CommandResult> {
  const started = Date.now();
  if (options.signal?.aborted) {
    return Promise.resolve({ exitCode: 1, stdout: "", stderr: "", success: false, duration: 0, aborted: true });
  }
  const encoding = options.encoding ?? "utf8";
  const limit = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const stdout = new OutputCollector(limit, options.keep);
  const stderr = new OutputCollector(limit, options.keep);

  return new Promise((resolve) => {
    const child = startChild(command, options, options.input !== undefined ? "pipe" : "ignore");
    let timedOut = false;
    let aborted = false;
    let settled = false;

    const timer = options.timeout !== undefined
      ? setTimeout(() => {
          timedOut = true;
          killTree(child);
        }, options.timeout)
      : undefined;
    const onAbort = (): void => {
      aborted = true;
      killTree(child);
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });

    const finish = (result: CommandResult): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };

    child.stdout!.on("data", (chunk: Buffer) => stdout.add(chunk));
    child.stderr!.on("data", (chunk: Buffer) => stderr.add(chunk));
    if (options.input !== undefined) {
      // A program that ends before it reads its input closes the pipe: that is not an error here
      child.stdin!.on("error", () => {});
      child.stdin!.end(options.input);
    }

    child.on("error", (error) => {
      // The program did not start: no "close" follows
      if (child.pid === undefined) {
        finish({
          exitCode: 1,
          stdout: "",
          stderr: startError(error),
          success: false,
          duration: Date.now() - started,
          error: startError(error),
        });
      }
    });

    child.on("close", (code, signal) => {
      const result: CommandResult = {
        exitCode: code ?? 1,
        stdout: stdout.text(encoding),
        stderr: stderr.text(encoding),
        success: code === 0 && !timedOut && !aborted,
        duration: Date.now() - started,
      };
      // On Windows, taskkill ends the process with an exit code and no signal
      const endSignal = signal ?? (timedOut || aborted ? "SIGTERM" : undefined);
      if (endSignal) result.signal = endSignal;
      if (timedOut) result.timedOut = true;
      if (aborted) result.aborted = true;
      if (stdout.truncated || stderr.truncated) {
        result.truncated = { stdout: stdout.truncated, stderr: stderr.truncated };
      }
      finish(result);
    });
  });
}
