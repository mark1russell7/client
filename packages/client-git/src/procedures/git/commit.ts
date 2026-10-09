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

  // Check if there's anything to commit (unless amending)
  if (!amend) {
    const status = (await git(["status", "--porcelain"], run)).trim();
    if (!status && !all) {
      // Nothing staged and not using -a, skip commit
      return { hash: "", message: "", author: "", date: "", skipped: true };
    }
    // If using -a, check if there are any modified files
    if (all) {
      const hasChanges = status.length > 0;
      if (!hasChanges) {
        return { hash: "", message: "", author: "", date: "", skipped: true };
      }
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
