/**
 * git.clone procedure
 *
 * Clone repository
 */

import { join, basename } from "node:path";
import { gitArg } from "./args.js";
import { git, type GitContext } from "./run.js";
import type { GitCloneInput, GitCloneOutput } from "../../types.js";

/**
 * Clone repository
 */
export async function gitClone(input: GitCloneInput, ctx: GitContext = {}): Promise<GitCloneOutput> {
  const { url, dest, branch, depth, cwd } = input;

  // Determine destination directory
  const destDir = dest || basename(url, ".git").replace(/\.git$/, "");
  const fullPath = cwd ? join(cwd, destDir) : destDir;

  const args: string[] = ["clone"];
  if (branch) args.push("-b", branch);
  if (depth) args.push("--depth", String(depth));
  args.push("--", gitArg("url", url), gitArg("dest", destDir));

  await git(args, { cwd, signal: ctx.signal });

  // Get the branch that was checked out
  const clonedBranch = (await git(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: fullPath, signal: ctx.signal })).trim();

  return { path: fullPath, branch: clonedBranch };
}
