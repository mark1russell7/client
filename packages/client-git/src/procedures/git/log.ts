/**
 * git.log procedure
 *
 * Show commit log
 */

import { execFileSync } from "node:child_process";
import { gitArg } from "./args.js";
import type { GitLogInput, GitLogOutput, GitLogCommit } from "../../types.js";

/**
 * Show commit log
 */
export async function gitLog(input: GitLogInput): Promise<GitLogOutput> {
  const { count, ref, cwd } = input;
  const opts = { cwd, encoding: "utf8" as const };

  // Use a delimiter that won't appear in commit messages
  const delim = "<<<COMMIT>>>";
  const format = `--format=%H|%h|%an|%ae|%ci|%s${delim}`;

  const args = ["log", `-n${count}`, format];
  if (ref) args.push(gitArg("ref", ref));

  const output = execFileSync("git", args, opts);
  // Each record ends with the delimiter and a newline, so the last chunk is only whitespace:
  // trim before filtering, or it becomes an empty commit
  const commits: GitLogCommit[] = output
    .split(delim)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const parts = line.split("|");
      return {
        hash: parts[0] ?? "",
        shortHash: parts[1] ?? "",
        author: parts[2] ?? "",
        email: parts[3] ?? "",
        date: parts[4] ?? "",
        message: parts.slice(5).join("|"), // In case message contains |
      };
    });

  return { commits };
}
