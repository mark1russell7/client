/**
 * git.worktree.remove procedure
 *
 * Remove a working tree and its folder (roadmap R40). Git refuses a working tree with changes
 * that are not committed, unless `force` is true. Then the changes are lost.
 */

import { git, type GitContext } from "../run.js";
import type { GitWorktreeRemoveInput, GitWorktreeRemoveOutput } from "../../../types.js";

/**
 * Remove a working tree
 */
export async function gitWorktreeRemove(input: GitWorktreeRemoveInput, ctx: GitContext = {}): Promise<GitWorktreeRemoveOutput> {
  const args = ["worktree", "remove"];
  if (input.force) args.push("--force");
  // After "--", a path that starts with "-" stays a path
  args.push("--", input.path);
  await git(args, { cwd: input.cwd, signal: ctx.signal });
  return { path: input.path };
}
