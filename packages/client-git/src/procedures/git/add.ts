/**
 * git.add procedure
 *
 * Stage files
 */

import { execFileSync } from "node:child_process";
import type { GitAddInput, GitAddOutput } from "../../types.js";

/**
 * Stage files
 */
export async function gitAdd(input: GitAddInput): Promise<GitAddOutput> {
  const { paths, all, cwd } = input;
  const opts = { cwd, encoding: "utf8" as const };

  if (all) {
    execFileSync("git", ["add", "-A"], opts);
  } else if (paths.length > 0) {
    execFileSync("git", ["add", "--", ...paths], opts);
  } else {
    execFileSync("git", ["add", "."], opts);
  }

  // Get list of staged files
  const stagedOutput = execFileSync("git", ["diff", "--cached", "--name-only"], opts);
  const staged = stagedOutput.split("\n").filter(Boolean);

  return { staged };
}
