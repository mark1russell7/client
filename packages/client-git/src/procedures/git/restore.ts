/**
 * git.restore procedure
 *
 * Restore files of the working tree or the index (roadmap R40). A restore of the working tree
 * deletes the changes of the files that are not committed.
 */

import { gitArg } from "./args.js";
import { git, type GitContext } from "./run.js";
import type { GitRestoreInput, GitRestoreOutput } from "../../types.js";

/**
 * Restore files of the working tree or the index
 */
export async function gitRestore(input: GitRestoreInput, ctx: GitContext = {}): Promise<GitRestoreOutput> {
  const { paths, source, staged, worktree, cwd } = input;

  const args = ["restore"];
  if (source) args.push(`--source=${gitArg("source", source)}`);
  if (staged) args.push("--staged");
  if (worktree) args.push("--worktree");
  // After "--", a path that starts with "-" stays a path
  args.push("--", ...paths);
  await git(args, { cwd, signal: ctx.signal });

  return { restored: paths };
}
