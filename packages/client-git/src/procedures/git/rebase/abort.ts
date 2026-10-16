/**
 * git.rebase.abort procedure
 *
 * Stop a rebase, and go back to the branch as it was before the rebase (roadmap R40). The
 * resolutions of the conflicts are lost. Without a rebase, the call fails.
 */

import { git, type GitContext } from "../run.js";
import { headHash } from "../refs.js";
import type { GitRebaseAbortInput, GitRebaseAbortOutput } from "../../../types.js";

/**
 * Stop a rebase, and go back to the branch before it
 */
export async function gitRebaseAbort(input: GitRebaseAbortInput, ctx: GitContext = {}): Promise<GitRebaseAbortOutput> {
  const run = { cwd: input.cwd, signal: ctx.signal };
  await git(["rebase", "--abort"], run);
  return { aborted: true, hash: await headHash(run) };
}
