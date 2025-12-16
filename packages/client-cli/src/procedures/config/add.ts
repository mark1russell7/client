/**
 * config.add procedure
 *
 * Adds a feature to dependencies.json.
 */

import { spawn } from "node:child_process";
import type { ConfigAddInput, ConfigAddOutput } from "../../types.js";

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
 * Add a feature to dependencies.json
 */
export async function configAdd(input: ConfigAddInput): Promise<ConfigAddOutput> {
  const projectPath = input.path ?? process.cwd();

  // Run cue-config add
  const result = await runCueConfig(["add", input.feature], projectPath);

  // Check if already present
  const alreadyPresent = result.stdout.includes("already in dependencies");

  return {
    success: result.success || alreadyPresent,
    feature: input.feature,
    added: result.success && !alreadyPresent,
    alreadyPresent,
    errors: result.success || alreadyPresent ? [] : [result.stderr || "Failed to add feature"],
    output: result.stdout,
  };
}
