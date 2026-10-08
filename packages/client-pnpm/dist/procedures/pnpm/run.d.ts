/**
 * pnpm.run procedure
 *
 * Run package scripts using pnpm.
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { PnpmRunInput, PnpmCommandOutput } from "../../types.js";
/**
 * Run a package script using pnpm
 *
 * @example
 * // Run build script
 * await client.call(["pnpm", "run"], {
 *   script: "build",
 * });
 *
 * @example
 * // Run test with arguments
 * await client.call(["pnpm", "run"], {
 *   script: "test",
 *   args: ["--watch"],
 * });
 */
export declare function pnpmRun(input: PnpmRunInput, ctx: ProcedureContext): Promise<PnpmCommandOutput>;
//# sourceMappingURL=run.d.ts.map