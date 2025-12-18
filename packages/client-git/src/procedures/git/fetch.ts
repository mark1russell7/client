/**
 * git.fetch procedure
 *
 * Fetch from remote without merging
 */

import { execSync } from "node:child_process";
import type { GitFetchInput, GitFetchOutput } from "../../types.js";

/**
 * Fetch from remote
 */
export async function gitFetch(input: GitFetchInput): Promise<GitFetchOutput> {
  const { branch, all, prune, cwd } = input;
  const remoteName = input.remote ?? "origin";
  const opts = { cwd, encoding: "utf8" as const };

  const args: string[] = ["git", "fetch"];
  if (all) {
    args.push("--all");
  } else {
    args.push(remoteName);
    if (branch) {
      args.push(branch);
    }
  }
  if (prune) args.push("--prune");

  execSync(args.join(" "), opts);

  return { remote: remoteName, fetched: true };
}
