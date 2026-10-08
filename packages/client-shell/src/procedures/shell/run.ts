/**
 * shell.run procedure
 *
 * Run a command with arguments and return output.
 */

import { spawn } from "node:child_process";
import type { ShellRunInput, ShellRunOutput } from "../../types.js";

/**
 * Most output kept per stream. Output beyond it is dropped (and reported), so a command
 * that prints without end cannot exhaust memory. The process is not killed.
 */
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

/**
 * Collects a stream's chunks as bytes and decodes them once at the end, so a multi-byte
 * character split across two chunks is not corrupted (BUGS-2026-07 L4).
 */
class OutputCollector {
  private chunks: Buffer[] = [];
  private bytes = 0;
  truncated = false;

  add(chunk: Buffer): void {
    if (this.bytes >= MAX_OUTPUT_BYTES) {
      this.truncated = true;
      return;
    }
    const room = MAX_OUTPUT_BYTES - this.bytes;
    const kept = chunk.length > room ? chunk.subarray(0, room) : chunk;
    if (kept.length < chunk.length) {
      this.truncated = true;
    }
    this.chunks.push(kept);
    this.bytes += kept.length;
  }

  text(encoding: BufferEncoding): string {
    const text = Buffer.concat(this.chunks).toString(encoding);
    return this.truncated ? `${text}\n[output truncated at ${MAX_OUTPUT_BYTES} bytes]` : text;
  }
}

export async function shellRun(input: ShellRunInput): Promise<ShellRunOutput> {
  const startTime = Date.now();
  const encoding = input.encoding as BufferEncoding;

  return new Promise((resolve) => {
    const proc = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: input.env ? { ...process.env, ...input.env } : process.env,
      timeout: input.timeout,
      shell: false,
      windowsHide: true,
    });

    const stdout = new OutputCollector();
    const stderr = new OutputCollector();

    proc.stdout?.on("data", (data: Buffer) => stdout.add(data));
    proc.stderr?.on("data", (data: Buffer) => stderr.add(data));

    proc.on("close", (code, signal) => {
      const output: ShellRunOutput = {
        exitCode: code ?? 1,
        stdout: stdout.text(encoding),
        stderr: stderr.text(encoding),
        success: code === 0,
        duration: Date.now() - startTime,
      };
      // A signal means the process was killed (for example by the timeout)
      if (signal) {
        output.signal = signal;
      }
      resolve(output);
    });

    proc.on("error", (err) => {
      resolve({
        exitCode: 1,
        stdout: stdout.text(encoding),
        stderr: stderr.text(encoding) + err.message,
        success: false,
        duration: Date.now() - startTime,
      });
    });
  });
}
