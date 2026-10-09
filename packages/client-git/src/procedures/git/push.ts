/**
 * git.push procedure
 *
 * Push to remote
 */

import { gitArg } from "./args.js";
import { git, GitError, type GitContext } from "./run.js";
import type { GitPushInput, GitPushOutput } from "../../types.js";

/**
 * Push to remote
 */
export async function gitPush(input: GitPushInput, ctx: GitContext = {}): Promise<GitPushOutput> {
  const { branch, force, setUpstream, cwd } = input;
  const remoteName = input.remote ?? "origin";
  const run = { cwd, signal: ctx.signal };

  // Get current branch if not specified
  const branchName = branch || (await git(["rev-parse", "--abbrev-ref", "HEAD"], run)).trim();

  // Count commits to push
  let commits = 0;
  try {
    const count = (await git(["rev-list", "--count", `${remoteName}/${branchName}..HEAD`], run)).trim();
    commits = parseInt(count, 10) || 0;
  } catch (error) {
    // Remote branch may not exist yet
    if (!(error instanceof GitError)) throw error;
    const count = (await git(["rev-list", "--count", "HEAD"], run)).trim();
    commits = parseInt(count, 10) || 0;
  }

  const args: string[] = ["push"];
  if (setUpstream) args.push("-u");
  if (force) args.push("--force");
  args.push(gitArg("remote", remoteName), gitArg("branch", branchName));

  await git(args, run);

  return { remote: remoteName, branch: branchName, commits };
}
