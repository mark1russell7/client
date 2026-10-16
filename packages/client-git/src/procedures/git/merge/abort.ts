/**
 * git.merge.abort procedure
 *
 * Stop a merge that has conflicts (roadmap R40). Git puts back the branch and the files as they
 * were before the merge. The resolutions of the conflicts are lost. Without a merge, the call
 * fails.
 */

import { git, type GitContext } from "../run.js";
import { headHash } from "../refs.js";
import type { GitMergeAbortInput, GitMergeAbortOutput } from "../../../types.js";

/**
 * Stop a merge that has conflicts
 */
export async function gitMergeAbort(input: GitMergeAbortInput, ctx: GitContext = {}): Promise<GitMergeAbortOutput> {
  const run = { cwd: input.cwd, signal: ctx.signal };
  await git(["merge", "--abort"], run);
  return { aborted: true, hash: await headHash(run) };
}
