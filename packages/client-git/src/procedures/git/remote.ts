/**
 * git.remote procedure
 *
 * Get or set remote URLs
 */

import { execSync } from "node:child_process";
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
      execSync(`git remote set-url ${name} ${url}`, opts);
    } catch {
      // Remote might not exist, try adding it
      execSync(`git remote add ${name} ${url}`, opts);
    }
    return { name, url };
  }

  // Get the remote URL
  const remoteUrl = execSync(`git remote get-url ${name}`, opts).trim();
  return { name, url: remoteUrl };
}
