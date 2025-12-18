/**
 * config.generate procedure
 *
 * Generates configuration files (package.json, tsconfig.json, .gitignore)
 * based on dependencies.json features using cue-config.
 */
import type { ConfigGenerateInput, ConfigGenerateOutput } from "../../types.js";
/**
 * Generate configuration files from dependencies.json
 */
export declare function configGenerate(input: ConfigGenerateInput): Promise<ConfigGenerateOutput>;
//# sourceMappingURL=generate.d.ts.map