/**
 * cue.remove procedure
 *
 * Remove a feature from dependencies.json.
 * Uses ctx.client.call() for file system operations (dogfooding).
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { CueRemoveInput, CueRemoveOutput } from "../../types.js";
/**
 * Remove a feature from dependencies.json
 */
export declare function cueRemove(input: CueRemoveInput, ctx: ProcedureContext): Promise<CueRemoveOutput>;
//# sourceMappingURL=remove.d.ts.map