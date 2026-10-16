/**
 * git.reset procedure
 *
 * Move HEAD to a commit, and reset the index or the working tree (roadmap R40). The mode hard
 * deletes the changes of the working tree that are not committed.
 */

import { gitArg } from "./args.js";
import { git, type GitContext } from "./run.js";
import { headHash } from "./refs.js";
import type { GitResetInput, GitResetOutput } from "../../types.js";

/**
 * Move HEAD to a commit, and reset the index or the working tree
 */
export async function gitReset(input: GitResetInput, ctx: GitContext = {}): Promise<GitResetOutput> {
  const ref = input.ref ?? "HEAD";
  const mode = input.mode ?? "mixed";
  const run = { cwd: input.cwd, signal: ctx.signal };

  const args = ["reset", "--quiet"];
  if (input.paths && input.paths.length > 0) {
    // Git resets paths only in the index: HEAD and the working tree stay
    if (mode !== "mixed") {
      throw new Error(`git.reset: paths need the mode mixed, not ${mode}`);
    }
    args.push(gitArg("ref", ref), "--", ...input.paths);
  } else {
    args.push(`--${mode}`, gitArg("ref", ref));
  }
  await git(args, run);

  return { ref, mode, hash: await headHash(run) };
}
