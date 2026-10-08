/**
 * node.run procedure
 *
 * Runs a Node.js script and waits for completion.
 */

import { spawn } from "child_process";
import type { NodeRunInput, NodeRunOutput } from "../../types.js";

/**
 * Run a Node.js script and wait for completion
 */
export async function nodeRun(input: NodeRunInput): Promise<NodeRunOutput> {
  const { script, args = [], cwd, env, timeout } = input;

  return new Promise((resolve, reject) => {
    const child = spawn("node", [script, ...args], {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timeoutId: NodeJS.Timeout | undefined;

    if (timeout) {
      timeoutId = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`Process timed out after ${timeout}ms`));
      }, timeout);
    }

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("exit", (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });

    child.on("error", (error) => {
      if (timeoutId) clearTimeout(timeoutId);
      reject(error);
    });
  });
}
