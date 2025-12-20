/**
 * CUE Generator
 *
 * Wraps CUE evaluation for generating package.json, tsconfig.json, .gitignore
 */
import type { GeneratorFn } from "../schema/types.js";
/**
 * Create a CUE-based generator function.
 *
 * @param cueExpr - The CUE expression to evaluate (e.g., "npm/package:output")
 */
export declare function cueGenerator(cueExpr: string): GeneratorFn;
/**
 * Delegate to cue-config init for initial setup.
 * This creates dependencies.json with the preset's features.
 */
export declare function runCueConfigInit(cwd: string, preset: string): Promise<void>;
/**
 * Delegate to cue-config generate for config generation.
 * This generates package.json, tsconfig.json, .gitignore.
 */
export declare function runCueConfigGenerate(cwd: string): Promise<void>;
//# sourceMappingURL=cue.d.ts.map