/**
 * cue.validate procedure
 *
 * Validate dependencies.json against schema.
 * Uses ctx.client.call() for file system operations (dogfooding).
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { CueValidateInput, CueValidateOutput } from "../../types.js";
/**
 * Validate dependencies.json
 */
export declare function cueValidate(input: CueValidateInput, ctx: ProcedureContext): Promise<CueValidateOutput>;
//# sourceMappingURL=validate.d.ts.map