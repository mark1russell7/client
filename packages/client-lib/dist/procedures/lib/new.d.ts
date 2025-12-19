/**
 * lib.new procedure
 *
 * Creates a new package with standard ecosystem structure.
 * Reads projectTemplate from ecosystem.manifest.json (single source of truth).
 * Uses fs.* and git.* procedures via ctx.client.call() for all operations.
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { LibNewInput, LibNewOutput } from "../../types.js";
/**
 * Create a new package with standard ecosystem structure
 */
export declare function libNew(input: LibNewInput, ctx: ProcedureContext): Promise<LibNewOutput>;
//# sourceMappingURL=new.d.ts.map