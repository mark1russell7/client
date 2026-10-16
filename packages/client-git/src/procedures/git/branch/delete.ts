/**
 * git.branch.delete procedure
 *
 * Delete a branch (roadmap R40). Git refuses a branch that is not merged, unless `force` is true.
 * The result gives the last commit of the branch, so git.branch.add can make it again.
 */

import { gitArg } from "../args.js";
import { git, GitError, type GitContext } from "../run.js";
import type { GitBranchDeleteInput, GitBranchDeleteOutput } from "../../../types.js";

/**
 * Delete a branch
 */
export async function gitBranchDelete(input: GitBranchDeleteInput, ctx: GitContext = {}): Promise<GitBranchDeleteOutput> {
  const name = gitArg("name", input.name);
  const run = { cwd: input.cwd, signal: ctx.signal };

  // With --quiet, a missing branch gives exit 1 and no message. Outside a repository, git gives 128.
  const hash = await git(["rev-parse", "--verify", "--quiet", `refs/heads/${name}^{commit}`], run).then(
    (output) => output.trim(),
    (error: unknown) => {
      if (error instanceof GitError && error.exitCode === 1) throw new Error(`branch '${name}' not found`);
      throw error;
    },
  );
  await git(["branch", input.force ? "-D" : "-d", name], run);
  return { name, hash };
}
