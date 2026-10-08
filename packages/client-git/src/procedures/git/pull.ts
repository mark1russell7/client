/**
 * git.pull procedure
 *
 * Pull from remote
 */

import { execFileSync } from "node:child_process";
import { gitArg } from "./args.js";
import type { GitPullInput, GitPullOutput } from "../../types.js";

/**
 * Pull from remote
 */
export async function gitPull(input: GitPullInput): Promise<GitPullOutput> {
  const { branch, rebase, cwd } = input;
  const remoteName = input.remote ?? "origin";
  const opts = { cwd, encoding: "utf8" as const };

  // Get current branch if not specified
  const branchName = branch || execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], opts).trim();

  // Get current HEAD before pull
  const beforeHead = execFileSync("git", ["rev-parse", "HEAD"], opts).trim();

  const args: string[] = ["pull"];
  if (rebase) args.push("--rebase");
  args.push(gitArg("remote", remoteName), gitArg("branch", branchName));

  execFileSync("git", args, opts);

  // Get new HEAD after pull
  const afterHead = execFileSync("git", ["rev-parse", "HEAD"], opts).trim();

  // Count new commits
  let commits = 0;
  if (beforeHead !== afterHead) {
    const count = execFileSync("git", ["rev-list", "--count", `${beforeHead}..${afterHead}`], opts).trim();
    commits = parseInt(count, 10) || 0;
  }

  // Check if it was fast-forward
  const fastForward = !rebase && beforeHead !== afterHead;

  return { remote: remoteName, branch: branchName, commits, fastForward };
}
