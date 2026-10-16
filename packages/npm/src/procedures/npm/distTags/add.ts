/**
 * npm.distTags.add procedure
 *
 * Set a dist-tag of a package to a version: a write to the registry. The tag moves from its
 * earlier version, and each install of `<package>@<tag>` gets the new version. The input must
 * have `confirm: true`.
 */

import type { ProcedureContext } from "@procedures/client";
import { accountOptions, npmArg, runNpm } from "../shared.js";
import type { NpmDistTagsAddInput, NpmDistTagsAddOutput } from "../../../types.js";

/**
 * Set a dist-tag of a package to a version
 *
 * @example
 * await client.call(["npm", "distTags", "add"], { package: "my-package", version: "2.0.0", tag: "latest", confirm: true });
 */
export async function npmDistTagsAdd(input: NpmDistTagsAddInput, ctx: ProcedureContext): Promise<NpmDistTagsAddOutput> {
  // The schema requires it. A direct call of this function gets the same check.
  if (input.confirm !== true) throw new Error("npm.distTags.add needs confirm: true");
  const spec = `${npmArg("package", input.package)}@${input.version}`;
  const args = ["dist-tag", "add", ...accountOptions(input), "--", spec, npmArg("tag", input.tag)];
  return runNpm(args, input, ctx);
}
