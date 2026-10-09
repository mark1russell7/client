/**
 * pnpm.run procedure
 *
 * Run package scripts using pnpm.
 */

import type { ProcedureContext } from "@mark1russell7/client";
import { pnpmArg, runPnpm } from "./shared.js";
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
export async function pnpmRun(
  input: PnpmRunInput,
  ctx: ProcedureContext
): Promise<PnpmCommandOutput> {
  {
    const args: string[] = ["run", pnpmArg("script", input.script)];

    // Add additional arguments
    if (input.args && input.args.length > 0) {
      args.push("--", ...input.args);
    }

    return runPnpm(args, input, ctx);
  }
}
