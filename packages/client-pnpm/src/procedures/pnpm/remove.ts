/**
 * pnpm.remove procedure
 *
 * Remove packages using pnpm.
 */

import type { ProcedureContext } from "@mark1russell7/client";
import { pnpmArg, runPnpm } from "./shared.js";
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
export async function pnpmRemove(
  input: PnpmRemoveInput,
  ctx: ProcedureContext
): Promise<PnpmCommandOutput> {
  {
    const args: string[] = ["remove", ...input.packages.map((p) => pnpmArg("package", p))];

    // Add flags
    if (input.global) args.push("--global");

    return runPnpm(args, input, ctx);
  }
}
