/**
 * shell.run procedure
 *
 * Run a command with arguments and return output.
 */

import { runCommand } from "../../command/run.js";
import type { ShellRunInput, ShellRunOutput } from "../../types.js";

/**
 * Most output kept per stream. Output beyond it is dropped (and reported), so a command
 * that prints without end cannot exhaust memory. The process is not killed.
 */
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

/**
 * Run a command with its arguments and no shell. The timeout and `ctx.signal` kill the whole
 * process tree (deep dive WRP-10).
 */
export async function shellRun(
  input: ShellRunInput,
  ctx?: { signal?: AbortSignal | undefined }
): Promise<ShellRunOutput> {
  const result = await runCommand(input.command, {
    args: input.args,
    cwd: input.cwd,
    env: input.env,
    timeout: input.timeout,
    signal: ctx?.signal,
    maxOutputBytes: MAX_OUTPUT_BYTES,
    encoding: input.encoding as BufferEncoding,
  });

  const note = `\n[output truncated at ${MAX_OUTPUT_BYTES} bytes]`;
  const output: ShellRunOutput = {
    exitCode: result.exitCode,
    stdout: result.truncated?.stdout ? result.stdout + note : result.stdout,
    stderr: result.truncated?.stderr ? result.stderr + note : result.stderr,
    success: result.success,
    duration: result.duration,
  };
  // A signal means the process was killed (for example by the timeout)
  if (result.signal) {
    output.signal = result.signal;
  }
  return output;
}
