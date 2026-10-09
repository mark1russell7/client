/**
 * git.log procedure
 *
 * Show commit log
 */

import { gitArg } from "./args.js";
import { git, type GitContext } from "./run.js";
import type { GitLogInput, GitLogOutput, GitLogCommit } from "../../types.js";

// Control characters that do not occur in a name, an email, a date or a subject
const FIELD = "\x1f";
const RECORD = "\x1e";

/**
 * Show commit log
 */
export async function gitLog(input: GitLogInput, ctx: GitContext = {}): Promise<GitLogOutput> {
  const { count, ref, cwd } = input;

  const format = `--format=${["%H", "%h", "%an", "%ae", "%ci", "%s"].join("%x1f")}%x1e`;
  const args = ["log", `-n${count}`, format];
  if (ref) args.push(gitArg("ref", ref));

  const output = await git(args, { cwd, signal: ctx.signal });
  const commits: GitLogCommit[] = output
    .split(RECORD)
    .map((record) => record.replace(/^\n/, ""))
    .filter((record) => record.length > 0)
    .map((record) => {
      const [hash = "", shortHash = "", author = "", email = "", date = "", message = ""] = record.split(FIELD);
      return { hash, shortHash, author, email, date, message };
    });

  const result: GitLogOutput = { commits };
  if (input.oneline) {
    result.lines = commits.map((commit) => `${commit.shortHash} ${commit.message}`);
  }
  return result;
}
