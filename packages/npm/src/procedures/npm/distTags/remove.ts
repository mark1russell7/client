/**
 * npm.distTags.remove procedure
 *
 * Remove a dist-tag of a package: a write to the registry. The input must have `confirm: true`.
 * npm refuses to remove the tag latest.
 */

import type { ProcedureContext } from "@procedures/client";
import { accountOptions, npmArg, runNpm } from "../shared.js";
import type { NpmDistTagsRemoveInput, NpmDistTagsRemoveOutput } from "../../../types.js";

/**
 * Remove a dist-tag of a package
 *
 * @example
 * await client.call(["npm", "distTags", "remove"], { package: "my-package", tag: "beta", confirm: true });
 */
export async function npmDistTagsRemove(input: NpmDistTagsRemoveInput, ctx: ProcedureContext): Promise<NpmDistTagsRemoveOutput> {
  // The schema requires it. A direct call of this function gets the same check.
  if (input.confirm !== true) throw new Error("npm.distTags.remove needs confirm: true");
  const args = ["dist-tag", "rm", ...accountOptions(input), "--", npmArg("package", input.package), npmArg("tag", input.tag)];
  return runNpm(args, input, ctx);
}
