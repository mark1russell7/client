/**
 * pnpm.add procedure
 *
 * Add packages using pnpm.
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { PnpmAddInput, PnpmCommandOutput } from "../../types.js";
/**
 * Add packages using pnpm
 *
 * @example
 * // Add a package
 * await client.call(["pnpm", "add"], {
 *   packages: ["lodash"],
 * });
 *
 * @example
 * // Add as dev dependency
 * await client.call(["pnpm", "add"], {
 *   packages: ["vitest", "@types/node"],
 *   dev: true,
 * });
 */
export declare function pnpmAdd(input: PnpmAddInput, ctx: ProcedureContext): Promise<PnpmCommandOutput>;
//# sourceMappingURL=add.d.ts.map