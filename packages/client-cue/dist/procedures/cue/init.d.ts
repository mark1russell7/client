/**
 * cue.init procedure
 *
 * Initialize dependencies.json with a preset.
 * Uses ctx.client.call() for file system operations (dogfooding).
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { CueInitInput, CueInitOutput } from "../../types.js";
/**
 * Initialize a project with dependencies.json
 */
export declare function cueInit(input: CueInitInput, ctx: ProcedureContext): Promise<CueInitOutput>;
//# sourceMappingURL=init.d.ts.map