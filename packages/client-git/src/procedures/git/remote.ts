/**
 * git.remote procedure
 *
 * Get or set remote URLs
 */

import { gitArg } from "./args.js";
import { git, GitError, type GitContext } from "./run.js";
import type { GitRemoteInput, GitRemoteOutput } from "../../types.js";

/**
 * Get or set remote URL
 */
export async function gitRemote(input: GitRemoteInput, ctx: GitContext = {}): Promise<GitRemoteOutput> {
  const { name, url, cwd } = input;
  const run = { cwd, signal: ctx.signal };

  if (url) {
    // Set the remote URL
    try {
      await git(["remote", "set-url", gitArg("name", name), gitArg("url", url)], run);
    } catch (error) {
      // Remote might not exist, try adding it
      if (!(error instanceof GitError)) throw error;
      await git(["remote", "add", gitArg("name", name), gitArg("url", url)], run);
    }
    return { name, url };
  }

  // Get the remote URL
  const remoteUrl = (await git(["remote", "get-url", gitArg("name", name)], run)).trim();
  return { name, url: remoteUrl };
}
