/**
 * git.branch.list procedure
 *
 * List the branches (roadmap R40). It works in a repository without commits too: there are no
 * branches yet, and `current` is the branch that HEAD names.
 */

import { git, type GitContext } from "../run.js";
import { currentBranch } from "../refs.js";
import type { GitBranchInfo, GitBranchListInput, GitBranchListOutput } from "../../../types.js";

/**
 * List the branches
 */
export async function gitBranchList(input: GitBranchListInput, ctx: GitContext = {}): Promise<GitBranchListOutput> {
  const run = { cwd: input.cwd, signal: ctx.signal };
  const current = await currentBranch(run);

  const args = ["branch"];
  if (input.remote) args.push("-a");
  // The full ref name tells local from remote branches: a local "feature/x" also contains "/"
  args.push("--format=%(refname)|%(refname:short)|%(HEAD)|%(upstream:short)");

  const output = await git(args, run);
  const branches: GitBranchInfo[] = output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [fullName = "", branchName = "", head = "", tracking = ""] = line.split("|");
      const result: GitBranchInfo = {
        name: branchName.replace(/^remotes\//, ""),
        current: head === "*",
        remote: fullName.startsWith("refs/remotes/"),
      };
      if (tracking) result.tracking = tracking;
      return result;
    });

  return { branches, current };
}
