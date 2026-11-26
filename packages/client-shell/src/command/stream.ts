/**
 * streamCommand: run a program and give each output line while it runs.
 *
 * The queue between the program and the reader has a limit (deep dive WRP-9). When the queue
 * is full, the helper stops reading the pipes of the program. The pipes fill, and the program
 * waits in its next write. When the reader takes items again, the helper reads again. Before,
 * the queue had no limit: a program with a large output filled the memory of the host.
 */

import type { Readable } from "node:stream";
import { createLineSplitter, DEFAULT_MAX_LINE_LENGTH } from "./lines.js";
import { endCommand, startChild, type SpawnOptions } from "./spawn.js";
import { unknownEncoding } from "./run.js";

/** One item of a stream: an output line, or the exit of the program (the last item). */
export type CommandStreamItem =
  | { type: "stdout" | "stderr"; line: string }
  | {
      type: "exit";
      exitCode: number;
      duration: number;
      signal?: string;
      timedOut?: boolean;
      aborted?: boolean;
    };

export interface StreamCommandOptions extends SpawnOptions {
  /**
   * The stdin of the program: text, bytes, or a stream that the helper pipes to stdin. The end of
   * the stream ends stdin. The helper does not end or destroy the stream. Without it, stdin is empty.
   */
  input?: string | Buffer | Readable | undefined;
  /** After this many milliseconds, the process tree is killed. */
  timeout?: number | undefined;
  /** When the signal aborts, the process tree is killed. */
  signal?: AbortSignal | undefined;
  /** The most items that wait for the reader before the helper stops reading (default: 1000). */
  highWaterMark?: number | undefined;
  /** A longer line arrives in parts of this many characters (default: 1 MiB). */
  maxLineLength?: number | undefined;
  /** The encoding of the output (default: utf8). */
  encoding?: BufferEncoding | undefined;
}

const DEFAULT_HIGH_WATER_MARK = 1000;

/**
 * This function runs `command` and yields each line of stdout and stderr, then one exit item.
 * When the reader stops early, or the signal aborts, the process tree is killed. A program that
 * cannot start, or an encoding that `Buffer` does not know, makes the generator throw.
 */
export async function* streamCommand(
  command: string,
  options: StreamCommandOptions = {},
): AsyncGenerator<CommandStreamItem, void, undefined> {
  const started = Date.now();
  const highWaterMark = Math.max(1, options.highWaterMark ?? DEFAULT_HIGH_WATER_MARK);
  const lowWaterMark = Math.floor(highWaterMark / 2);
  const encoding = options.encoding ?? "utf8";
  // An unknown encoding starts nothing: the decoders below are made after the start of the program
  if (!Buffer.isEncoding(encoding)) throw new TypeError(unknownEncoding(encoding));

  const items: CommandStreamItem[] = [];
  let ended = false;
  let failure: { error: Error } | undefined;
  let wake: (() => void) | undefined;
  const notify = (): void => {
    const resume = wake;
    wake = undefined;
    resume?.();
  };

  if (options.signal?.aborted) {
    yield { type: "exit", exitCode: 1, duration: 0, aborted: true };
    return;
  }

  const child = startChild(command, options, options.input !== undefined ? "pipe" : "ignore");
  let paused = false;
  let timedOut = false;
  let aborted = false;

  const pause = (): void => {
    if (paused) return;
    paused = true;
    child.stdout!.pause();
    child.stderr!.pause();
  };
  const resume = (): void => {
    if (!paused) return;
    paused = false;
    child.stdout!.resume();
    child.stderr!.resume();
  };
  const push = (item: CommandStreamItem): void => {
    items.push(item);
    if (items.length >= highWaterMark) pause();
    notify();
  };

  // A splitter for each stream keeps a character whose bytes arrive in two chunks (deep dive WRP-2)
  const lineOptions = { maxLineLength: options.maxLineLength ?? DEFAULT_MAX_LINE_LENGTH, encoding };
  const splitters = { stdout: createLineSplitter(lineOptions), stderr: createLineSplitter(lineOptions) };
  const onData = (type: "stdout" | "stderr") => (data: Buffer): void => {
    for (const line of splitters[type].push(data)) push({ type, line });
  };
  child.stdout!.on("data", onData("stdout"));
  child.stderr!.on("data", onData("stderr"));

  const input = options.input;
  const stdin = child.stdin;
  const piped = input !== undefined && typeof input !== "string" && !Buffer.isBuffer(input) ? input : undefined;
  if (input !== undefined && stdin) {
    stdin.on("error", () => {});
    if (piped) piped.pipe(stdin);
    else stdin.end(input);
  }

  const timer = options.timeout !== undefined
    ? setTimeout(() => {
        timedOut = true;
        endCommand(child);
      }, options.timeout)
    : undefined;
  const onAbort = (): void => {
    aborted = true;
    endCommand(child);
  };
  options.signal?.addEventListener("abort", onAbort, { once: true });

  child.on("error", (error) => {
    if (child.pid === undefined) {
      failure = { error };
      notify();
    }
  });
  child.on("close", (code, signal) => {
    for (const type of ["stdout", "stderr"] as const) {
      for (const line of splitters[type].flush()) push({ type, line });
    }
    const exit: CommandStreamItem = { type: "exit", exitCode: code ?? 1, duration: Date.now() - started };
    const endSignal = signal ?? (timedOut || aborted ? "SIGTERM" : undefined);
    if (endSignal) exit.signal = endSignal;
    if (timedOut) exit.timedOut = true;
    if (aborted) exit.aborted = true;
    items.push(exit);
    ended = true;
    notify();
  });

  try {
    for (;;) {
      if (items.length > 0) {
        const item = items.shift()!;
        if (items.length <= lowWaterMark) resume();
        yield item;
        continue;
      }
      if (failure) throw failure.error;
      if (ended) return;
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
  } finally {
    if (timer) clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
    // The stream of the caller stays open: only its pipe to the program ends
    if (piped && stdin) piped.unpipe(stdin);
    // The reader stopped early: end the program and its descendants. The pipes read again, so
    // they can close.
    if (!ended) {
      resume();
      endCommand(child);
    }
  }
}
