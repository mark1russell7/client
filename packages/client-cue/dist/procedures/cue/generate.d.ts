/**
 * cue.generate procedure
 *
 * Generate config files (package.json, tsconfig.json, .gitignore).
 * Uses ctx.client.call() for file system operations (dogfooding).
 * Uses spawnSync for CUE CLI tool (external binary).
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { CueGenerateInput, CueGenerateOutput } from "../../types.js";
/**
 * Generate config files from dependencies.json
 */
export declare function cueGenerate(input: CueGenerateInput, ctx: ProcedureContext): Promise<CueGenerateOutput>;
//# sourceMappingURL=generate.d.ts.map