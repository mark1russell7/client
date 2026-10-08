/**
 * git.clone procedure
 *
 * Clone repository
 */

import { execFileSync } from "node:child_process";
import { join, basename } from "node:path";
import type { GitCloneInput, GitCloneOutput } from "../../types.js";

/**
 * Clone repository
 */
export async function gitClone(input: GitCloneInput): Promise<GitCloneOutput> {
  const { url, dest, branch, depth, cwd } = input;
  const opts = { cwd, encoding: "utf8" as const };

  // Determine destination directory
  const destDir = dest || basename(url, ".git").replace(/\.git$/, "");
  const fullPath = cwd ? join(cwd, destDir) : destDir;

  const args: string[] = ["clone"];
  if (branch) args.push("-b", branch);
  if (depth) args.push("--depth", String(depth));
  args.push(url, destDir);

  execFileSync("git", args, opts);

  // Get the branch that was checked out
  const clonedBranch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: fullPath,
    encoding: "utf8",
  }).trim();

  return { path: fullPath, branch: clonedBranch };
}
