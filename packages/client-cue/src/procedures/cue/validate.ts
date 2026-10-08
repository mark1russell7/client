/**
 * cue.validate procedure
 *
 * Validate dependencies.json against schema.
 * Uses ctx.client.call() for file system operations (dogfooding).
 */

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import type { ProcedureContext } from "@mark1russell7/client";
import type { CueValidateInput, CueValidateOutput } from "../../types.js";
import {
  loadFeatures,
  loadDependencies,
  checkCue,
  packageRoot,
  fileExists,
} from "../../shared.js";

/**
 * Validate dependencies.json
 */
export async function cueValidate(
  input: CueValidateInput,
  ctx: ProcedureContext
): Promise<CueValidateOutput> {
  const projectPath = input.cwd ?? process.cwd();
  const errors: string[] = [];

  // Load dependencies
  const deps = await loadDependencies(projectPath, ctx);
  if (!deps) {
    return {
      success: false,
      valid: false,
      features: [],
      errors: ["No dependencies.json found. Run cue.init first."],
    };
  }

  // Load features manifest
  const manifest = await loadFeatures(ctx);
  if (!manifest) {
    return {
      success: false,
      valid: false,
      features: deps,
      errors: ["Could not load features.json from @mark1russell7/cue package"],
    };
  }

  // Validate each feature exists
  for (const feature of deps) {
    if (!manifest.features[feature]) {
      errors.push(`Unknown feature: '${feature}'`);
    }
  }

  if (errors.length > 0) {
    return {
      success: true,
      valid: false,
      features: deps,
      errors,
      message: `Validation failed with ${errors.length} error(s)`,
    };
  }

  // If CUE is available, validate against schema
  if (checkCue()) {
    const schemaPath = resolve(packageRoot, "dependencies/schema.cue");
    if (await fileExists(schemaPath, ctx)) {
      const depsPath = resolve(projectPath, "dependencies.json");
      const result = spawnSync("cue", ["vet", "-d", "#Dependencies", schemaPath, depsPath], {
        encoding: "utf-8",
        stdio: ["inherit", "pipe", "pipe"],
      });

      if (result.status !== 0) {
        errors.push(`CUE schema validation failed: ${result.stderr || result.stdout}`);
        return {
          success: true,
          valid: false,
          features: deps,
          errors,
          message: "CUE schema validation failed",
        };
      }
    }
  }

  return {
    success: true,
    valid: true,
    features: deps,
    errors: [],
    message: "Validation passed",
  };
}
