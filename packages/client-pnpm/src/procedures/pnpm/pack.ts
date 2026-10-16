/**
 * pnpm.pack procedure
 *
 * Make a tarball of the package (roadmap R41). `data` is the parsed output of
 * `pnpm pack --json`: the name, the version, the file name and the files of the tarball. With
 * `dryRun`, pnpm writes no tarball.
 */

import type { ProcedureContext } from "@procedures/client";
import { runPnpmJson } from "./shared.js";
import type { PnpmPackInput, PnpmPackOutput } from "../../types.js";

/**
 * Make a tarball of the package
 *
 * @example
 * const { data } = await client.call(["pnpm", "pack"], { cwd: "packages/app", dryRun: true });
 */
export async function pnpmPack(input: PnpmPackInput, ctx: ProcedureContext): Promise<PnpmPackOutput> {
  const args = ["pack", "--json"];
  if (input.dryRun) args.push("--dry-run");
  // With "=", a folder that starts with "-" stays the value of the option
  if (input.destination !== undefined) args.push(`--pack-destination=${input.destination}`);
  return runPnpmJson(args, input, ctx);
}
