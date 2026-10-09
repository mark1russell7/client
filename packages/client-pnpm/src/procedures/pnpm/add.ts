/**
 * pnpm.add procedure
 *
 * Add packages using pnpm.
 */

import type { ProcedureContext } from "@mark1russell7/client";
import { pnpmArg, runPnpm } from "./shared.js";
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
export async function pnpmAdd(
  input: PnpmAddInput,
  ctx: ProcedureContext
): Promise<PnpmCommandOutput> {
  {
    const args: string[] = ["add", ...input.packages.map((p) => pnpmArg("package", p))];

    // Add flags
    if (input.dev) args.push("--save-dev");
    if (input.global) args.push("--global");

    return runPnpm(args, input, ctx);
  }
}
