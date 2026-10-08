/**
 * git.branch procedure
 *
 * Branch operations
 */

import { execFileSync } from "node:child_process";
import { gitArg } from "./args.js";
import type { GitBranchInput, GitBranchOutput, GitBranchInfo } from "../../types.js";

/**
 * Branch operations
 */
export async function gitBranch(input: GitBranchInput): Promise<GitBranchOutput> {
  const { name, delete: del, list, remote, cwd } = input;
  const opts = { cwd, encoding: "utf8" as const };

  // Get current branch
  const current = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], opts).trim();

  // Delete branch
  if (del && name) {
    execFileSync("git", ["branch", "-d", gitArg("name", name)], opts);
    return { deleted: name, current };
  }

  // Create branch
  if (name && !list) {
    execFileSync("git", ["branch", gitArg("name", name)], opts);
    return { created: name, current };
  }

  // List branches
  const args = ["branch"];
  if (remote) args.push("-a");
  // The full ref name tells local from remote branches: a local "feature/x" also contains "/"
  args.push("--format=%(refname)|%(refname:short)|%(HEAD)|%(upstream:short)");

  const output = execFileSync("git", args, opts);
  const branches: GitBranchInfo[] = output
    .split("\n")
    .filter(Boolean)
    .map(line => {
      const parts = line.split("|");
      const fullName = parts[0] ?? "";
      const branchName = parts[1] ?? "";
      const head = parts[2] ?? "";
      const trackingVal = parts[3];
      const result: GitBranchInfo = {
        name: branchName.replace(/^remotes\//, ""),
        current: head === "*",
        remote: fullName.startsWith("refs/remotes/"),
      };
      if (trackingVal) {
        result.tracking = trackingVal;
      }
      return result;
    });

  return { branches, current };
}
