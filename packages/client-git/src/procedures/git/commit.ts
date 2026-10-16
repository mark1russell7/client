/**
 * git.commit procedure
 *
 * Create commit
 */

import { git, type GitContext } from "./run.js";
import type { GitCommitInput, GitCommitOutput } from "../../types.js";

/**
 * Create commit
 */
export async function gitCommit(input: GitCommitInput, ctx: GitContext = {}): Promise<GitCommitOutput> {
  const { message, all, amend, cwd } = input;
  const run = { cwd, signal: ctx.signal };

  // Check if there's anything to commit (unless amending). Each line of `git status --porcelain`
  // is "XY path": X is the index, Y the work tree, "??" an untracked file. Without -a, only a
  // staged change counts. With -a, a change of a tracked file counts too. An untracked file is
  // never a change to commit. (Before, any line counted, so an untracked file or an unstaged
  // change made git commit fail with "nothing added to commit": roadmap R33.)
  if (!amend) {
    const lines = (await git(["status", "--porcelain"], run)).split("\n").filter((line) => line.length > 0);
    const tracked = lines.filter((line) => !line.startsWith("??") && !line.startsWith("!!"));
    const staged = tracked.filter((line) => line[0] !== " ");
    if ((all ? tracked : staged).length === 0) {
      return { hash: "", message: "", author: "", date: "", skipped: true };
    }
  }

  const args: string[] = ["commit"];
  if (all) args.push("-a");
  if (amend) args.push("--amend");
  args.push("-m", message);

  await git(args, run);

  // Get commit info
  const format = "--format=%H%n%s%n%an%n%ci";
  const info = (await git(["log", "-1", format], run)).trim();
  const [hash = "", msg = "", author = "", date = ""] = info.split("\n");

  return { hash, message: msg, author, date };
}
