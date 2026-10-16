/**
 * git.branch procedure (deprecated)
 *
 * Branch operations. Since roadmap R40, git.branch.list, git.branch.add and git.branch.delete do
 * this, one procedure for each operation. This procedure stays for one release, and calls them.
 * Its inputs and outputs do not change. The current branch comes from `git symbolic-ref`, so a
 * repository without commits works now too (before, `git rev-parse --abbrev-ref HEAD` failed).
 */

import { type GitContext } from "./run.js";
import { currentBranch } from "./refs.js";
import { gitBranchList } from "./branch/list.js";
import { gitBranchAdd } from "./branch/add.js";
import { gitBranchDelete } from "./branch/delete.js";
import type { GitBranchInput, GitBranchOutput } from "../../types.js";

/**
 * Branch operations
 *
 * @deprecated Use `gitBranchList`, `gitBranchAdd` or `gitBranchDelete` (git.branch.list,
 * git.branch.add, git.branch.delete).
 */
export async function gitBranch(input: GitBranchInput, ctx: GitContext = {}): Promise<GitBranchOutput> {
  const { name, delete: del, list, remote, cwd } = input;

  // Delete branch
  if (del && name) {
    await gitBranchDelete({ name, cwd }, ctx);
    return { deleted: name, current: await currentBranch({ cwd, signal: ctx.signal }) };
  }

  // Create branch
  if (name && !list) {
    await gitBranchAdd({ name, cwd }, ctx);
    return { created: name, current: await currentBranch({ cwd, signal: ctx.signal }) };
  }

  // List branches
  return gitBranchList({ remote, cwd }, ctx);
}
