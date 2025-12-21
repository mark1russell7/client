/**
 * pnpm.remove procedure
 *
 * Remove packages using pnpm.
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { PnpmRemoveInput, PnpmCommandOutput } from "../../types.js";
/**
 * Remove packages using pnpm
 *
 * @example
 * // Remove packages
 * await client.call(["pnpm", "remove"], {
 *   packages: ["lodash"],
 * });
 */
export declare function pnpmRemove(input: PnpmRemoveInput, ctx: ProcedureContext): Promise<PnpmCommandOutput>;
//# sourceMappingURL=remove.d.ts.map