/**
 * npm.view procedure
 *
 * Read the fields of a package of the npm registry. `data` is the JSON of `npm view --json`:
 * one value for one field, an object for several fields or for all.
 */

import type { ProcedureContext } from "@procedures/client";
import { accountOptions, npmArg, runNpmJson } from "./shared.js";
import type { NpmViewInput, NpmViewOutput } from "../../types.js";

/**
 * Read the fields of a package of the npm registry
 *
 * @example
 * const { data } = await client.call(["npm", "view"], { package: "zod", fields: ["version", "dist-tags"] });
 */
export async function npmView(input: NpmViewInput, ctx: ProcedureContext): Promise<NpmViewOutput> {
  const args = ["view", "--json", ...accountOptions(input), "--", npmArg("package", input.package)];
  args.push(...(input.fields ?? []).map((field) => npmArg("field", field)));
  return runNpmJson(args, input, ctx);
}
