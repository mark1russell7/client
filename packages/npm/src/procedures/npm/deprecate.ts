/**
 * npm.deprecate procedure
 *
 * Deprecate versions of a package in the npm registry: a write to the registry. npm shows the
 * message at each install of the versions. An empty message removes the deprecation. The input
 * must have `confirm: true`.
 */

import type { ProcedureContext } from "@procedures/client";
import { accountOptions, npmArg, runNpm } from "./shared.js";
import type { NpmDeprecateInput, NpmDeprecateOutput } from "../../types.js";

/**
 * Deprecate versions of a package in the npm registry
 *
 * @example
 * await client.call(["npm", "deprecate"], { package: "my-package@<2.0.0", message: "Use 2.x", confirm: true });
 */
export async function npmDeprecate(input: NpmDeprecateInput, ctx: ProcedureContext): Promise<NpmDeprecateOutput> {
  // The schema requires it. A direct call of this function gets the same check.
  if (input.confirm !== true) throw new Error("npm.deprecate needs confirm: true");
  // After "--", a message that starts with "-" stays the message
  const args = ["deprecate", ...accountOptions(input), "--", npmArg("package", input.package), input.message];
  return runNpm(args, input, ctx);
}
