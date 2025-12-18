/**
 * git.add procedure
 *
 * Stage files
 */

import { execSync } from "node:child_process";
import type { GitAddInput, GitAddOutput } from "../../types.js";

/**
 * Stage files
 */
export async function gitAdd(input: GitAddInput): Promise<GitAddOutput> {
  const { paths, all, cwd } = input;
  const opts = { cwd, encoding: "utf8" as const };

  if (all) {
    execSync("git add -A", opts);
  } else if (paths.length > 0) {
    execSync(`git add -- ${paths.map(p => `"${p}"`).join(" ")}`, opts);
  } else {
    execSync("git add .", opts);
  }

  // Get list of staged files
  const stagedOutput = execSync("git diff --cached --name-only", opts);
  const staged = stagedOutput.split("\n").filter(Boolean);

  return { staged };
}
