/**
 * git.log procedure
 *
 * Show commit log
 */

import { execSync } from "node:child_process";
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

  const args = ["git", "log", `-n${count}`, format];
  if (ref) args.push(ref);

  const output = execSync(args.join(" "), opts);
  const commits: GitLogCommit[] = output
    .split(delim)
    .filter(Boolean)
    .map(line => {
      const parts = line.trim().split("|");
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
