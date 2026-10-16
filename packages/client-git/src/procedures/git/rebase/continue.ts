/**
 * git.rebase.continue procedure
 *
 * Continue a rebase after the conflicts are resolved and staged (roadmap R40). Git keeps the
 * message of each commit: it does not start an editor. A next commit can stop on conflicts again.
 */

import { type GitContext } from "../run.js";
import { conflictedFiles, headHash } from "../refs.js";
import { rebaseStep } from "../rebase.js";
import type { GitRebaseContinueInput, GitRebaseContinueOutput } from "../../../types.js";

/**
 * Continue a rebase after the conflicts are resolved
 */
export async function gitRebaseContinue(input: GitRebaseContinueInput, ctx: GitContext = {}): Promise<GitRebaseContinueOutput> {
  const run = { cwd: input.cwd, signal: ctx.signal };
  // Files that still have conflicts: git refuses to continue, so the call gives them
  const unresolved = await conflictedFiles(run);
  if (unresolved.length > 0) {
    return { hash: await headHash(run), completed: false, upToDate: false, conflict: true, conflicts: unresolved };
  }
  // A continued rebase changed the branch: upToDate is false
  return rebaseStep(["rebase", "--continue"], "", run);
}
