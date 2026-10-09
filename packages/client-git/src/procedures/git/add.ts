/**
 * git.add procedure
 *
 * Stage files
 */

import { git, type GitContext } from "./run.js";
import type { GitAddInput, GitAddOutput } from "../../types.js";

/**
 * Stage files
 */
export async function gitAdd(input: GitAddInput, ctx: GitContext = {}): Promise<GitAddOutput> {
  const { paths, all, cwd } = input;
  const run = { cwd, signal: ctx.signal };

  if (all) {
    await git(["add", "-A"], run);
  } else if (paths.length > 0) {
    await git(["add", "--", ...paths], run);
  } else {
    await git(["add", "."], run);
  }

  // Get list of staged files (with -z, a path with a space or a quote stays exact)
  const staged = (await git(["diff", "--cached", "--name-only", "-z"], run)).split("\0").filter(Boolean);

  return { staged };
}
