/**
 * procedure.new - Scaffold a new procedure
 *
 * Creates the procedure file, types, and registration boilerplate.
 * Supports dot-notation names like "user.create" which creates a
 * procedure at ["user", "create"] in the user/ namespace folder.
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { ProcedureNewInput, ProcedureNewOutput } from "../../types.js";
/**
 * Scaffold a new procedure
 */
export declare function procedureNew(input: ProcedureNewInput, ctx: ProcedureContext): Promise<ProcedureNewOutput>;
//# sourceMappingURL=new.d.ts.map