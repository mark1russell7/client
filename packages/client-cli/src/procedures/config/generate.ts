/**
 * config.generate procedure
 *
 * Generates configuration files (package.json, tsconfig.json, .gitignore)
 * based on dependencies.json features using cue-config.
 */

import { spawn } from "node:child_process";
import type { ProcedureContext } from "@mark1russell7/client";
import type { ConfigGenerateInput, ConfigGenerateOutput } from "../../types.js";

interface FsExistsOutput { exists: boolean; path: string; }

/**
 * Check if a path exists
 */
async function pathExists(pathStr: string, ctx: ProcedureContext): Promise<boolean> {
  try {
    const result = await ctx.client.call<{ path: string }, FsExistsOutput>(
      ["fs", "exists"],
      { path: pathStr }
    );
    return result.exists;
  } catch {
    return false;
  }
}

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
 * Generate configuration files from dependencies.json
 */
export async function configGenerate(
  input: ConfigGenerateInput,
  ctx: ProcedureContext
): Promise<ConfigGenerateOutput> {
  const projectPath = input.path ?? process.cwd();
  const generated: string[] = [];
  const errors: string[] = [];

  // Check if dependencies.json exists
  const depsPath = `${projectPath}/dependencies.json`;
  if (!(await pathExists(depsPath, ctx))) {
    return {
      success: false,
      generated: [],
      errors: [
        "No dependencies.json found. Run config.init first or create dependencies.json manually.",
      ],
    };
  }

  // Run cue-config generate
  const result = await runCueConfig(["generate"], projectPath);

  if (!result.success) {
    return {
      success: false,
      generated: [],
      errors: [result.stderr || "Generation failed"],
    };
  }

  // Parse output to determine what was generated
  if (result.stdout.includes("package.json")) {
    generated.push("package.json");
  }
  if (result.stdout.includes("tsconfig.json")) {
    generated.push("tsconfig.json");
  }
  if (result.stdout.includes(".gitignore")) {
    generated.push(".gitignore");
  }
  if (result.stdout.includes("cue.mod")) {
    generated.push("cue.mod/");
  }

  return {
    success: true,
    generated,
    errors,
    output: result.stdout,
  };
}
