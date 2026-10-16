/**
 * git.branch.add procedure
 *
 * Make a branch (roadmap R40). An existing branch is an error: the procedure never moves a branch.
 */

import { gitArg } from "../args.js";
import { git, type GitContext } from "../run.js";
import { commitOf } from "../refs.js";
import type { GitBranchAddInput, GitBranchAddOutput } from "../../../types.js";

/**
 * Make a branch
 */
export async function gitBranchAdd(input: GitBranchAddInput, ctx: GitContext = {}): Promise<GitBranchAddOutput> {
  const name = gitArg("name", input.name);
  const run = { cwd: input.cwd, signal: ctx.signal };

  const args = ["branch", name];
  if (input.startPoint) args.push(gitArg("startPoint", input.startPoint));
  await git(args, run);

  return { name, hash: await commitOf(`refs/heads/${name}`, run) };
}
