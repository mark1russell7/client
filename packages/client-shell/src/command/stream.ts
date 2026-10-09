/**
 * streamCommand: run a program and give each output line while it runs.
 *
 * The queue between the program and the reader has a limit (deep dive WRP-9). When the queue
 * is full, the helper stops reading the pipes of the program. The pipes fill, and the program
 * waits in its next write. When the reader takes items again, the helper reads again. Before,
 * the queue had no limit: a program with a large output filled the memory of the host.
 */

import { StringDecoder } from "node:string_decoder";
import { killTree } from "./tree-kill.js";
import { startChild, type SpawnOptions } from "./spawn.js";

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
  /** Text or bytes to write to stdin. Without it, stdin is empty. */
  input?: string | Buffer | undefined;
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
const DEFAULT_MAX_LINE_LENGTH = 1024 * 1024;

/**
 * This function runs `command` and yields each line of stdout and stderr, then one exit item.
 * When the reader stops early, or the signal aborts, the process tree is killed. A program that
 * cannot start makes the generator throw.
 */
export async function* streamCommand(
  command: string,
  options: StreamCommandOptions = {},
): AsyncGenerator<CommandStreamItem, void, undefined> {
  const started = Date.now();
  const highWaterMark = Math.max(1, options.highWaterMark ?? DEFAULT_HIGH_WATER_MARK);
  const lowWaterMark = Math.floor(highWaterMark / 2);
  const maxLineLength = Math.max(1, options.maxLineLength ?? DEFAULT_MAX_LINE_LENGTH);
  const encoding = options.encoding ?? "utf8";

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

  // A decoder for each stream keeps a character whose bytes arrive in two chunks (deep dive WRP-2)
  const partial = { stdout: "", stderr: "" };
  const decoders = { stdout: new StringDecoder(encoding), stderr: new StringDecoder(encoding) };
  const emit = (type: "stdout" | "stderr", text: string): void => {
    if (text.length <= maxLineLength) {
      push({ type, line: text });
      return;
    }
    for (let at = 0; at < text.length; at += maxLineLength) {
      push({ type, line: text.slice(at, at + maxLineLength) });
    }
  };
  const onData = (type: "stdout" | "stderr") => (data: Buffer): void => {
    const lines = (partial[type] + decoders[type].write(data)).split(/\r?\n/);
    let rest = lines.pop() ?? "";
    for (const line of lines) emit(type, line);
    // A line without its end yet: give the full parts now, keep the remainder
    if (rest.length >= maxLineLength) {
      const whole = rest.length - (rest.length % maxLineLength);
      emit(type, rest.slice(0, whole));
      rest = rest.slice(whole);
    }
    partial[type] = rest;
  };
  child.stdout!.on("data", onData("stdout"));
  child.stderr!.on("data", onData("stderr"));

  if (options.input !== undefined) {
    child.stdin!.on("error", () => {});
    child.stdin!.end(options.input);
  }

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

  child.on("error", (error) => {
    if (child.pid === undefined) {
      failure = { error };
      notify();
    }
  });
  child.on("close", (code, signal) => {
    for (const type of ["stdout", "stderr"] as const) {
      const rest = partial[type] + decoders[type].end();
      if (rest) emit(type, rest);
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
    // The reader stopped early: end the program and its descendants. The pipes read again, so
    // they can close.
    if (!ended) {
      resume();
      killTree(child);
    }
  }
}
