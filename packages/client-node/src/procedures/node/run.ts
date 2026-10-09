/**
 * node.run procedure
 *
 * Runs a Node.js script and waits for completion.
 *
 * The script runs with the Node.js of the host (`process.execPath`), through `runCommand` of
 * client-shell: the output has a limit, and the timeout and the signal kill the script and the
 * processes that it started (deep dive WRP-10). Before, the output had no limit, and the timeout
 * killed only the direct child.
 */

import { runCommand } from "@mark1russell7/client-shell/command";
import type { NodeRunInput, NodeRunOutput } from "../../types.js";

/** The end of the output that a timeout error shows. */
const ERROR_OUTPUT_CHARS = 2000;

/**
 * Run a Node.js script and wait for completion
 */
export async function nodeRun(
  input: NodeRunInput,
  ctx?: { signal?: AbortSignal | undefined }
): Promise<NodeRunOutput> {
  const { script, args = [], cwd, env, timeout, maxOutputBytes } = input;

  const result = await runCommand(process.execPath, {
    args: [script, ...args],
    cwd,
    env,
    timeout,
    signal: ctx?.signal,
    maxOutputBytes,
  });

  if (result.error) {
    throw new Error(`node did not start: ${result.error}`);
  }
  if (result.timedOut) {
    const output = `${result.stdout}${result.stderr}`.slice(-ERROR_OUTPUT_CHARS);
    throw new Error(`Process timed out after ${timeout}ms${output ? `. Output:\n${output}` : ""}`);
  }
  if (result.aborted) {
    const error = new Error("node.run was aborted");
    error.name = "AbortError";
    throw error;
  }

  const output: NodeRunOutput = {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  };
  if (result.truncated) output.truncated = true;
  return output;
}
