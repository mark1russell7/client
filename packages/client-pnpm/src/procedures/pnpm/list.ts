/**
 * pnpm.list procedure
 *
 * List the installed packages as JSON (roadmap R41). `data` is the parsed output of
 * `pnpm list --json`: one entry for each project.
 */

import type { ProcedureContext } from "@procedures/client";
import { pnpmArg, runPnpmJson, selectionArgs } from "./shared.js";
import type { PnpmListInput, PnpmListOutput } from "../../types.js";

/** The options of list and why: the depth and the kinds of dependencies. */
export function treeOptions(input: { depth?: number | undefined; prod?: boolean | undefined; dev?: boolean | undefined }): string[] {
  const args: string[] = [];
  if (input.depth !== undefined) args.push("--depth", String(input.depth));
  if (input.prod) args.push("--prod");
  if (input.dev) args.push("--dev");
  return args;
}

/**
 * List the installed packages as JSON
 *
 * @example
 * const { data } = await client.call(["pnpm", "list"], { depth: 0, recursive: true });
 */
export async function pnpmList(input: PnpmListInput, ctx: ProcedureContext): Promise<PnpmListOutput> {
  const args = [...selectionArgs(input), "list", "--json", ...treeOptions(input)];
  args.push(...(input.packages ?? []).map((name) => pnpmArg("package", name)));
  return runPnpmJson(args, input, ctx);
}
