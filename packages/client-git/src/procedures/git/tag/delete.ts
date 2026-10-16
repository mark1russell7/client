/**
 * git.tag.delete procedure
 *
 * Delete a tag (roadmap R40).
 */

import { gitArg } from "../args.js";
import { git, type GitContext } from "../run.js";
import type { GitTagDeleteInput, GitTagDeleteOutput } from "../../../types.js";

/**
 * Delete a tag
 */
export async function gitTagDelete(input: GitTagDeleteInput, ctx: GitContext = {}): Promise<GitTagDeleteOutput> {
  const name = gitArg("name", input.name);
  const run = { cwd: input.cwd, signal: ctx.signal };

  // The object of the tag before the deletion: a tag object or a commit
  const hash = (await git(["rev-parse", "--verify", `refs/tags/${name}`], run)).trim();
  await git(["tag", "-d", name], run);
  return { name, hash };
}
