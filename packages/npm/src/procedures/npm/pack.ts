/**
 * npm.pack procedure
 *
 * Make a tarball of the package. The default is a dry run: npm lists the files of the tarball,
 * and writes no tarball. `data` is the JSON of `npm pack --json`. npm runs the prepack, prepare
 * and postpack scripts of the package, also in a dry run.
 */

import type { ProcedureContext } from "@procedures/client";
import { runNpmJson } from "./shared.js";
import type { NpmPackInput, NpmPackOutput } from "../../types.js";

/**
 * Make a tarball of the package, or with a dry run only list its files
 *
 * @example
 * const { data } = await client.call(["npm", "pack"], { cwd: "packages/app" });
 */
export async function npmPack(input: NpmPackInput, ctx: ProcedureContext): Promise<NpmPackOutput> {
  const args = ["pack", "--json"];
  // A dry run unless the input says false
  if (input.dryRun !== false) args.push("--dry-run");
  // With "=", a folder that starts with "-" stays the value of the option
  if (input.destination !== undefined) args.push(`--pack-destination=${input.destination}`);
  return runNpmJson(args, input, ctx);
}
