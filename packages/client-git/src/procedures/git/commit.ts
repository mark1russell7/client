/**
 * git.commit procedure
 *
 * Create commit
 */

import { git, type GitContext } from "./run.js";
import { parsePorcelainV1 } from "./porcelain.js";
import type { GitCommitInput, GitCommitOutput } from "../../types.js";

/**
 * Create commit. With `paths`, the commit has only those pathspecs, as they are in the working
 * tree (`git commit -- <paths>`), and the other staged changes stay in the index.
 */
export async function gitCommit(input: GitCommitInput, ctx: GitContext = {}): Promise<GitCommitOutput> {
  const { message, all, amend, cwd } = input;
  const paths = input.paths !== undefined && input.paths.length > 0 ? input.paths : undefined;
  const run = { cwd, signal: ctx.signal };
  if (all && paths) {
    throw new Error("git.commit cannot use all and paths together: git refuses -a with paths");
  }

  // Check if there's anything to commit (unless amending). Each entry has two status letters
  // "XY": X is the index, Y the work tree, "??" an untracked file. Without -a, only a staged
  // change counts. With -a, a change of a tracked file counts too. With paths, git commits each
  // change of a tracked file in those paths, staged or not. An untracked file is never a change
  // to commit. (Before, any line counted, so an untracked file or an unstaged change made git
  // commit fail with "nothing added to commit": roadmap R33.)
  if (!amend) {
    const statusArgs = ["status", "--porcelain=v1", "-z", ...(paths ? ["--", ...paths] : [])];
    const entries = parsePorcelainV1(await git(statusArgs, run));
    const tracked = entries.filter((entry) => entry.xy !== "??" && entry.xy !== "!!");
    const staged = tracked.filter((entry) => entry.xy[0] !== " ");
    if ((all || paths ? tracked : staged).length === 0) {
      return { hash: "", message: "", author: "", date: "", skipped: true };
    }
  }

  const args: string[] = ["commit"];
  if (all) args.push("-a");
  if (amend) args.push("--amend");
  args.push("-m", message);
  // After "--", git reads each value as a pathspec, also a value that starts with "-"
  if (paths) args.push("--", ...paths);

  await git(args, run);

  // Get commit info
  const format = "--format=%H%n%s%n%an%n%ci";
  const info = (await git(["log", "-1", format], run)).trim();
  const [hash = "", msg = "", author = "", date = ""] = info.split("\n");

  return { hash, message: msg, author, date };
}
