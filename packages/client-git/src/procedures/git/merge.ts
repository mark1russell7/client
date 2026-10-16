/**
 * git.merge procedure
 *
 * Merge a branch or a commit into the current branch (roadmap R40).
 *
 * A merge that stops on conflicts is a result, not an error: `conflict` is true, and `conflicts`
 * names the files. Then resolve them and call git.commit, or call git.merge.abort. Git does not
 * start an editor for the message of the merge commit.
 */

import { gitArg } from "./args.js";
import { git, type GitContext } from "./run.js";
import { commitOf, conflictedFiles, headHash, NO_EDITOR, stoppedOnConflict } from "./refs.js";
import type { GitMergeInput, GitMergeOutput } from "../../types.js";

/**
 * Merge a branch or a commit into the current branch
 */
export async function gitMerge(input: GitMergeInput, ctx: GitContext = {}): Promise<GitMergeOutput> {
  const { ref, message, cwd } = input;
  const fastForward = input.fastForward ?? "auto";
  const run = { cwd, signal: ctx.signal };

  const target = await commitOf(ref, run);
  const before = await headHash(run);

  const args = ["merge", "--no-edit"];
  if (fastForward === "only") args.push("--ff-only");
  if (fastForward === "never") args.push("--no-ff");
  if (message !== undefined) args.push("-m", message);
  args.push(gitArg("ref", ref));

  try {
    await git(args, { ...run, env: NO_EDITOR });
  } catch (error) {
    if (!stoppedOnConflict(error)) throw error;
    return { ref, hash: before, fastForward: false, upToDate: false, conflict: true, conflicts: await conflictedFiles(run) };
  }

  const after = await headHash(run);
  return { ref, hash: after, fastForward: after !== before && after === target, upToDate: after === before, conflict: false };
}
