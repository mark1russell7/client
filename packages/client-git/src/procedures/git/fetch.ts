/**
 * git.fetch procedure
 *
 * Fetch from remote without merging
 */

import { gitArg } from "./args.js";
import { git, type GitContext } from "./run.js";
import type { GitFetchInput, GitFetchOutput } from "../../types.js";

/**
 * Fetch from remote
 */
export async function gitFetch(input: GitFetchInput, ctx: GitContext = {}): Promise<GitFetchOutput> {
  const { branch, all, prune, cwd } = input;
  const remoteName = input.remote ?? "origin";

  const args: string[] = ["fetch"];
  if (all) {
    args.push("--all");
  } else {
    args.push(gitArg("remote", remoteName));
    if (branch) {
      args.push(gitArg("branch", branch));
    }
  }
  if (prune) args.push("--prune");

  await git(args, { cwd, signal: ctx.signal });

  return { remote: remoteName, fetched: true };
}
