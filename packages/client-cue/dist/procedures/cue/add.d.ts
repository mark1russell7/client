/**
 * cue.add procedure
 *
 * Add a feature to dependencies.json.
 * Uses ctx.client.call() for file system operations (dogfooding).
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { CueAddInput, CueAddOutput } from "../../types.js";
/**
 * Add a feature to dependencies.json
 */
export declare function cueAdd(input: CueAddInput, ctx: ProcedureContext): Promise<CueAddOutput>;
//# sourceMappingURL=add.d.ts.map