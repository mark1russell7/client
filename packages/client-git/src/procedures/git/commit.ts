/**
 * git.commit procedure
 *
 * Create commit
 */

import { execSync } from "node:child_process";
import type { GitCommitInput, GitCommitOutput } from "../../types.js";

/**
 * Create commit
 */
export async function gitCommit(input: GitCommitInput): Promise<GitCommitOutput> {
  const { message, all, amend, cwd } = input;
  const opts = { cwd, encoding: "utf8" as const };

  const args: string[] = ["git", "commit"];
  if (all) args.push("-a");
  if (amend) args.push("--amend");
  args.push("-m", `"${message.replace(/"/g, '\\"')}"`);

  execSync(args.join(" "), opts);

  // Get commit info
  const format = "--format=%H%n%s%n%an%n%ci";
  const info = execSync(`git log -1 ${format}`, opts).trim();
  const [hash = "", msg = "", author = "", date = ""] = info.split("\n");

  return { hash, message: msg, author, date };
}
