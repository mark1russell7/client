/**
 * shell.stream procedure
 *
 * Run a command and stream each output line as it arrives. The procedure is a generator: the
 * caller reads `{ type: "stdout" | "stderr", line }` items while the command runs, then one
 * `{ type: "exit" }` item. When the caller stops reading, or its signal aborts, the command and
 * the programs that it started end.
 *
 * The queue to the reader has a limit: when the reader is slow, the command waits in its next
 * write (deep dive WRP-9). A character whose bytes arrive in two chunks stays whole (deep dive
 * WRP-2). The work is done by `streamCommand`.
 */

import { streamCommand } from "../../command/stream.js";
import type { ShellStreamInput, ShellStreamItem } from "../../types.js";

/**
 * Run a command and stream each output line as it arrives
 */
export async function* shellStream(
  input: ShellStreamInput,
  ctx?: { signal?: AbortSignal | undefined }
): AsyncGenerator<ShellStreamItem, void, undefined> {
  // No shell: the arguments cannot inject commands
  for await (const item of streamCommand(input.command, {
    args: input.args,
    cwd: input.cwd,
    env: input.env,
    timeout: input.timeout,
    signal: ctx?.signal,
  })) {
    if (item.type === "exit") {
      yield {
        type: "exit",
        exitCode: item.exitCode,
        duration: item.duration,
        ...(item.signal ? { signal: item.signal } : {}),
      };
    } else {
      yield item;
    }
  }
}
