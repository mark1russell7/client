/**
 * shell.stream procedure
 *
 * Run a command and stream each output line as it arrives. The procedure is a generator: the
 * caller reads `{ type: "stdout" | "stderr", line }` items while the command runs, then one
 * `{ type: "exit" }` item. When the caller stops reading, or its signal aborts, the command ends.
 */

import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import type { ShellStreamInput, ShellStreamItem } from "../../types.js";

/** A queue with one writer (the process events) and one reader (the generator). */
class LineQueue {
  private items: ShellStreamItem[] = [];
  private ended = false;
  private failure: { error: Error } | undefined;
  private wake: (() => void) | undefined;

  push(item: ShellStreamItem): void {
    this.items.push(item);
    this.notify();
  }

  end(): void {
    this.ended = true;
    this.notify();
  }

  fail(error: Error): void {
    this.failure = { error };
    this.notify();
  }

  private notify(): void {
    const wake = this.wake;
    this.wake = undefined;
    wake?.();
  }

  async *drain(): AsyncGenerator<ShellStreamItem, void, undefined> {
    for (;;) {
      if (this.items.length > 0) {
        yield this.items.shift()!;
        continue;
      }
      if (this.failure) throw this.failure.error;
      if (this.ended) return;
      await new Promise<void>((resolve) => {
        this.wake = resolve;
      });
    }
  }
}

/**
 * Run a command and stream each output line as it arrives
 */
export async function* shellStream(
  input: ShellStreamInput,
  ctx?: { signal?: AbortSignal | undefined }
): AsyncGenerator<ShellStreamItem, void, undefined> {
  const started = Date.now();
  const queue = new LineQueue();
  // No shell: the arguments cannot inject commands
  const proc = spawn(input.command, input.args, {
    cwd: input.cwd,
    env: input.env ? { ...process.env, ...input.env } : process.env,
    timeout: input.timeout,
    shell: false,
    windowsHide: true,
  });

  // Split each stream into lines. The last part of a chunk waits for the rest of its line.
  // A decoder per stream keeps a character whose bytes arrive in two chunks. (Before, each chunk
  // was decoded alone, so a split "€" became three replacement characters: deep dive WRP-2.)
  const partial = { stdout: "", stderr: "" };
  const decoders = { stdout: new StringDecoder("utf8"), stderr: new StringDecoder("utf8") };
  const onData = (type: "stdout" | "stderr") => (data: Buffer) => {
    const text = partial[type] + decoders[type].write(data);
    const lines = text.split(/\r?\n/);
    partial[type] = lines.pop() ?? "";
    for (const line of lines) queue.push({ type, line });
  };
  proc.stdout?.on("data", onData("stdout"));
  proc.stderr?.on("data", onData("stderr"));

  proc.on("error", (error) => queue.fail(error));
  proc.on("close", (code, signal) => {
    for (const type of ["stdout", "stderr"] as const) {
      const rest = partial[type] + decoders[type].end();
      if (rest) queue.push({ type, line: rest });
    }
    queue.push({
      type: "exit",
      exitCode: code ?? -1,
      duration: Date.now() - started,
      ...(signal ? { signal } : {}),
    });
    queue.end();
  });

  const onAbort = (): void => {
    proc.kill();
  };
  ctx?.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    yield* queue.drain();
  } finally {
    ctx?.signal?.removeEventListener("abort", onAbort);
    // The reader stopped early: end the command
    if (proc.exitCode === null && proc.signalCode === null) proc.kill();
  }
}
