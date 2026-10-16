/**
 * pnpm.outdated procedure
 *
 * List the outdated packages as JSON (roadmap R41). pnpm reads the npm registry. `data` is the
 * parsed output of `pnpm outdated --format json`.
 *
 * pnpm exits with 1 when a package is outdated. That is an answer, not a failure: when the output
 * is JSON, the result has `success: true`.
 */

import type { ProcedureContext } from "@procedures/client";
import { pnpmArg, runPnpmJson, selectionArgs } from "./shared.js";
import type { PnpmOutdatedInput, PnpmOutdatedOutput } from "../../types.js";

/**
 * List the outdated packages as JSON
 *
 * @example
 * const { data } = await client.call(["pnpm", "outdated"], { recursive: true });
 */
export async function pnpmOutdated(input: PnpmOutdatedInput, ctx: ProcedureContext): Promise<PnpmOutdatedOutput> {
  const args = [...selectionArgs(input), "outdated", "--format", "json"];
  if (input.prod) args.push("--prod");
  if (input.dev) args.push("--dev");
  args.push(...(input.packages ?? []).map((name) => pnpmArg("package", name)));
  const result = await runPnpmJson(args, input, ctx);
  if (result.exitCode === 1 && result.data !== undefined) result.success = true;
  return result;
}
