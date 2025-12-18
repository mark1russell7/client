/**
 * config.generate procedure
 *
 * Generates configuration files (package.json, tsconfig.json, .gitignore)
 * based on dependencies.json features using cue-config.
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { ConfigGenerateInput, ConfigGenerateOutput } from "../../types.js";
/**
 * Generate configuration files from dependencies.json
 */
export declare function configGenerate(input: ConfigGenerateInput, ctx: ProcedureContext): Promise<ConfigGenerateOutput>;
//# sourceMappingURL=generate.d.ts.map