/**
 * cue.validate procedure
 *
 * Validate dependencies.json against schema.
 * Uses ctx.client.call() for file system operations (dogfooding).
 */

import { resolve } from "node:path";
import type { ProcedureContext } from "@mark1russell7/client";
import type { CueValidateInput, CueValidateOutput } from "../../types.js";
import {
  loadFeatures,
  loadDependencies,
  checkCue,
  runCue,
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
  if (await checkCue(ctx.signal)) {
    const schemaPath = resolve(packageRoot, "dependencies/schema.cue");
    if (await fileExists(schemaPath, ctx)) {
      const depsPath = resolve(projectPath, "dependencies.json");
      const result = await runCue(["vet", "-d", "#Dependencies", schemaPath, depsPath], { signal: ctx.signal });

      if (!result.success) {
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
