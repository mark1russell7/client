/**
 * CUE Generator
 *
 * Wraps CUE evaluation for generating package.json, tsconfig.json, .gitignore
 */

import { execSync } from "node:child_process";
import type { GeneratorContext, GeneratorFn } from "../schema/types.js";

/**
 * Create a CUE-based generator function.
 *
 * @param cueExpr - The CUE expression to evaluate (e.g., "npm/package:output")
 */
export function cueGenerator(cueExpr: string): GeneratorFn {
  return async (_path: string, context: GeneratorContext): Promise<string> => {
    // Build feature injection flags
    const featureFlags = [...context.features]
      .map((f) => `--inject feature_${f}=true`)
      .join(" ");

    // CUE eval command
    const cmd = `cue eval ${cueExpr} ${featureFlags} --out json`;

    try {
      const result = execSync(cmd, {
        cwd: context.rootPath,
        encoding: "utf-8",
      });

      // Format JSON output
      return JSON.stringify(JSON.parse(result), null, 2) + "\n";
    } catch (error) {
      throw new Error(`CUE evaluation failed for ${cueExpr}: ${error}`);
    }
  };
}

/**
 * Delegate to cue-config init for initial setup.
 * This creates dependencies.json with the preset's features.
 */
export async function runCueConfigInit(
  cwd: string,
  preset: string
): Promise<void> {
  try {
    execSync(`npx cue-config init --preset ${preset}`, {
      cwd,
      stdio: "inherit",
    });
  } catch (error) {
    throw new Error(`cue-config init failed: ${error}`);
  }
}

/**
 * Delegate to cue-config generate for config generation.
 * This generates package.json, tsconfig.json, .gitignore.
 */
export async function runCueConfigGenerate(cwd: string): Promise<void> {
  try {
    execSync("npx cue-config generate", {
      cwd,
      stdio: "inherit",
    });
  } catch (error) {
    throw new Error(`cue-config generate failed: ${error}`);
  }
}
