/**
 * config.remove procedure
 *
 * Removes a feature from dependencies.json.
 */

import { spawn } from "node:child_process";
import type { ConfigRemoveInput, ConfigRemoveOutput } from "../../types.js";

/**
 * Execute cue-config command
 */
function runCueConfig(
  args: string[],
  cwd: string
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn("npx", ["cue-config", ...args], {
      cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({
        success: code === 0,
        stdout,
        stderr,
      });
    });

    proc.on("error", (error) => {
      resolve({
        success: false,
        stdout,
        stderr: error.message,
      });
    });
  });
}

/**
 * Remove a feature from dependencies.json
 */
export async function configRemove(input: ConfigRemoveInput): Promise<ConfigRemoveOutput> {
  const projectPath = input.path ?? process.cwd();

  // Run cue-config remove
  const result = await runCueConfig(["remove", input.feature], projectPath);

  // Check if not present
  const notPresent = result.stdout.includes("is not in dependencies");

  return {
    success: result.success || notPresent,
    feature: input.feature,
    removed: result.success && !notPresent,
    notPresent,
    errors: result.success || notPresent ? [] : [result.stderr || "Failed to remove feature"],
    output: result.stdout,
  };
}
