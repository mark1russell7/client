/**
 * git.pull procedure
 *
 * Pull from remote
 */

import { gitArg } from "./args.js";
import { git, type GitContext } from "./run.js";
import type { GitPullInput, GitPullOutput } from "../../types.js";

/**
 * Pull from remote
 */
export async function gitPull(input: GitPullInput, ctx: GitContext = {}): Promise<GitPullOutput> {
  const { branch, rebase, cwd } = input;
  const remoteName = input.remote ?? "origin";
  const run = { cwd, signal: ctx.signal };

  // Get current branch if not specified
  const branchName = branch || (await git(["rev-parse", "--abbrev-ref", "HEAD"], run)).trim();

  // Get current HEAD before pull
  const beforeHead = (await git(["rev-parse", "HEAD"], run)).trim();

  const args: string[] = ["pull"];
  if (rebase) args.push("--rebase");
  args.push(gitArg("remote", remoteName), gitArg("branch", branchName));

  await git(args, run);

  // Get new HEAD after pull
  const afterHead = (await git(["rev-parse", "HEAD"], run)).trim();

  // Count new commits
  let commits = 0;
  if (beforeHead !== afterHead) {
    const count = (await git(["rev-list", "--count", `${beforeHead}..${afterHead}`], run)).trim();
    commits = parseInt(count, 10) || 0;
  }

  // Check if it was fast-forward
  const fastForward = !rebase && beforeHead !== afterHead;

  return { remote: remoteName, branch: branchName, commits, fastForward };
}
