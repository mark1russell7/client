/**
 * pnpm.link procedure
 *
 * Link packages using pnpm.
 */

import type { ProcedureContext } from "@mark1russell7/client";
import { pnpmArg, runPnpm } from "./shared.js";
import type { PnpmLinkInput, PnpmCommandOutput } from "../../types.js";

/**
 * Link packages using pnpm
 *
 * @example
 * // Link current directory globally
 * await client.call(["pnpm", "link"], {
 *   global: true,
 * });
 *
 * @example
 * // Link a specific path
 * await client.call(["pnpm", "link"], {
 *   path: "../other-package",
 * });
 */
export async function pnpmLink(
  input: PnpmLinkInput,
  ctx: ProcedureContext
): Promise<PnpmCommandOutput> {
  {
    const args: string[] = ["link"];

    // Add path if specified
    if (input.path !== undefined) {
      args.push(pnpmArg("path", input.path));
    }

    // Add flags
    if (input.global) args.push("--global");

    return runPnpm(args, input, ctx);
  }
}
