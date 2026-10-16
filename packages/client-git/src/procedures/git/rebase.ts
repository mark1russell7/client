/**
 * git.rebase procedure
 *
 * Rebase the current branch on another branch (roadmap R40). The rebase is never interactive,
 * and git does not start an editor.
 *
 * A rebase that stops on conflicts is a result, not an error: `conflict` is true, and
 * `conflicts` names the files. Then resolve them, stage them with git.add and call
 * git.rebase.continue, or call git.rebase.abort.
 */

import { gitArg } from "./args.js";
import { git, type GitContext, type GitRunOptions } from "./run.js";
import { commitOf, conflictedFiles, headHash, NO_EDITOR, stoppedOnConflict } from "./refs.js";
import type { GitRebaseInput, GitRebaseOutput } from "../../types.js";

/**
 * This function runs a step of a rebase (the start or `--continue`), and gives its result. A
 * stop on conflicts gives `conflict: true`. Any other failure throws.
 */
export async function rebaseStep(args: string[], before: string, run: GitRunOptions): Promise<GitRebaseOutput> {
  try {
    await git(args, { ...run, env: NO_EDITOR });
  } catch (error) {
    if (!stoppedOnConflict(error)) throw error;
    return { hash: await headHash(run), completed: false, upToDate: false, conflict: true, conflicts: await conflictedFiles(run) };
  }
  const hash = await headHash(run);
  return { hash, completed: true, upToDate: hash === before, conflict: false };
}

/**
 * Rebase the current branch on another branch
 */
export async function gitRebase(input: GitRebaseInput, ctx: GitContext = {}): Promise<GitRebaseOutput> {
  const { upstream, onto, branch, cwd } = input;
  const run = { cwd, signal: ctx.signal };

  // With a branch, git checks it out first: compare with that branch
  const before = branch ? await commitOf(branch, run) : await headHash(run);

  const args = ["rebase"];
  if (onto) args.push("--onto", gitArg("onto", onto));
  args.push(gitArg("upstream", upstream));
  if (branch) args.push(gitArg("branch", branch));

  return rebaseStep(args, before, run);
}
