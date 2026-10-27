/**
 * git.push procedure
 *
 * Push to remote
 */

import { gitArg } from "./args.js";
import { git, GitError, type GitContext } from "./run.js";
import { currentBranch } from "./refs.js";
import type { GitPushInput, GitPushOutput } from "../../types.js";

/**
 * Push to remote
 */
export async function gitPush(input: GitPushInput, ctx: GitContext = {}): Promise<GitPushOutput> {
  const { branch, force, setUpstream, cwd } = input;
  // The guards run before the first git call: `git rev-list` reads the range too, and a remote
  // or a branch that starts with "-" is an option there.
  const remoteName = gitArg("remote", input.remote ?? "origin");
  if (branch) gitArg("branch", branch);
  const run = { cwd, signal: ctx.signal };

  // The current branch if not specified. `git symbolic-ref` reads it in a repository without
  // commits too, so git gives its own error there (roadmap R40).
  const branchName = gitArg("branch", branch || (await currentBranch(run)));

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
  args.push(remoteName, branchName);

  await git(args, run);

  return { remote: remoteName, branch: branchName, commits };
}
