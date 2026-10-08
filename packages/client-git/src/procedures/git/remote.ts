/**
 * git.remote procedure
 *
 * Get or set remote URLs
 */

import { execFileSync } from "node:child_process";
import { gitArg } from "./args.js";
import type { GitRemoteInput, GitRemoteOutput } from "../../types.js";

/**
 * Get or set remote URL
 */
export async function gitRemote(input: GitRemoteInput): Promise<GitRemoteOutput> {
  const { name, url, cwd } = input;
  const opts = { cwd, encoding: "utf8" as const };

  if (url) {
    // Set the remote URL
    try {
      execFileSync("git", ["remote", "set-url", gitArg("name", name), gitArg("url", url)], opts);
    } catch {
      // Remote might not exist, try adding it
      execFileSync("git", ["remote", "add", gitArg("name", name), gitArg("url", url)], opts);
    }
    return { name, url };
  }

  // Get the remote URL
  const remoteUrl = execFileSync("git", ["remote", "get-url", gitArg("name", name)], opts).trim();
  return { name, url: remoteUrl };
}
