/**
 * pnpm.update procedure
 *
 * Update packages (roadmap R41). Without `latest`, pnpm keeps each version in the range of
 * package.json. With `latest`, it changes the ranges too.
 */

import type { ProcedureContext } from "@procedures/client";
import { pnpmArg, runPnpm, selectionArgs } from "./shared.js";
import type { PnpmUpdateInput, PnpmUpdateOutput } from "../../types.js";

/**
 * Update packages to their newest versions in the ranges
 *
 * @example
 * await client.call(["pnpm", "update"], { packages: ["vitest"], latest: true, filter: ["@scope/app"] });
 */
export async function pnpmUpdate(input: PnpmUpdateInput, ctx: ProcedureContext): Promise<PnpmUpdateOutput> {
  const args = [...selectionArgs(input), "update"];
  if (input.latest) args.push("--latest");
  if (input.prod) args.push("--prod");
  if (input.dev) args.push("--dev");
  args.push(...(input.packages ?? []).map((name) => pnpmArg("package", name)));
  return runPnpm(args, input, ctx);
}
