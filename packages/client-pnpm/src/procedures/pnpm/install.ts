/**
 * pnpm.install procedure
 *
 * Install packages using pnpm.
 */

import type { ProcedureContext } from "@mark1russell7/client";
import { pnpmArg, runPnpm } from "./shared.js";
import type { PnpmInstallInput, PnpmCommandOutput } from "../../types.js";

/**
 * Install packages using pnpm
 *
 * @example
 * // Install all dependencies from package.json
 * await client.call(["pnpm", "install"], {});
 *
 * @example
 * // Install specific packages as dev dependencies
 * await client.call(["pnpm", "install"], {
 *   packages: ["vitest", "@types/node"],
 *   dev: true,
 * });
 */
export async function pnpmInstall(
  input: PnpmInstallInput,
  ctx: ProcedureContext
): Promise<PnpmCommandOutput> {
  {
    const args: string[] = ["install"];

    // Add packages if specified
    if (input.packages && input.packages.length > 0) {
      args.push(...input.packages.map((p) => pnpmArg("package", p)));
    }

    // Add flags
    if (input.dev) args.push("--save-dev");
    if (input.frozen) args.push("--frozen-lockfile");

    return runPnpm(args, input, ctx);
  }
}
