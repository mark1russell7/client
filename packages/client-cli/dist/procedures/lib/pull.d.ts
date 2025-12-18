/**
 * lib.pull procedure
 *
 * Pull from remote for all packages in dependency order.
 * Like lib.refresh --all but only does git pull (no install/build/push).
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { LibPullInput, LibPullOutput } from "../../types.js";
/**
 * Pull from remote for all packages in dependency order
 */
export declare function libPull(input: LibPullInput, ctx: ProcedureContext): Promise<LibPullOutput>;
//# sourceMappingURL=pull.d.ts.map