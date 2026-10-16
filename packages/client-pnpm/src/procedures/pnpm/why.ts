/**
 * pnpm.why procedure
 *
 * Show why a package is installed, as JSON (roadmap R41). `data` is the parsed output of
 * `pnpm why --json`: the packages that depend on it.
 */

import type { ProcedureContext } from "@procedures/client";
import { pnpmArg, runPnpmJson, selectionArgs } from "./shared.js";
import { treeOptions } from "./list.js";
import type { PnpmWhyInput, PnpmWhyOutput } from "../../types.js";

/**
 * Show why a package is installed, as JSON
 *
 * @example
 * const { data } = await client.call(["pnpm", "why"], { packages: ["zod"] });
 */
export async function pnpmWhy(input: PnpmWhyInput, ctx: ProcedureContext): Promise<PnpmWhyOutput> {
  const args = [...selectionArgs(input), "why", "--json", ...treeOptions(input)];
  args.push(...input.packages.map((name) => pnpmArg("package", name)));
  return runPnpmJson(args, input, ctx);
}
