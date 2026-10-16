/**
 * git.blame procedure
 *
 * Show the commit and the author of each line of a file (roadmap R40).
 *
 * The procedure reads `git blame --line-porcelain`: each line of the file comes with all the
 * fields of its commit, and its text after a tab.
 */

import { gitArg } from "./args.js";
import { git, type GitContext } from "./run.js";
import type { GitBlameInput, GitBlameLine, GitBlameOutput } from "../../types.js";

/** This function reads the output of `git blame --line-porcelain`. */
export function parseBlame(output: string): GitBlameLine[] {
  const lines: GitBlameLine[] = [];
  let current: Partial<GitBlameLine> & { time?: number } = {};
  for (const row of output.split("\n")) {
    if (row.startsWith("\t")) {
      // The text of the line ends the entry
      lines.push({
        line: current.line ?? lines.length + 1,
        hash: current.hash ?? "",
        author: current.author ?? "",
        email: current.email ?? "",
        date: current.time !== undefined ? new Date(current.time * 1000).toISOString() : "",
        summary: current.summary ?? "",
        content: row.slice(1),
      });
      current = {};
      continue;
    }
    const space = row.indexOf(" ");
    const key = space < 0 ? row : row.slice(0, space);
    const value = space < 0 ? "" : row.slice(space + 1);
    if (/^[0-9a-f]{40,64}$/.test(key)) {
      // "<hash> <line in the commit> <line in the file> [<lines of the group>]"
      current.hash = key;
      current.line = Number(value.split(" ")[1]);
    } else if (key === "author") {
      current.author = value;
    } else if (key === "author-mail") {
      current.email = value.replace(/^<|>$/g, "");
    } else if (key === "author-time") {
      current.time = Number(value);
    } else if (key === "summary") {
      current.summary = value;
    }
  }
  return lines;
}

/**
 * Show the commit and the author of each line of a file
 */
export async function gitBlame(input: GitBlameInput, ctx: GitContext = {}): Promise<GitBlameOutput> {
  const { path, ref, startLine, endLine, cwd } = input;
  const args = ["blame", "--line-porcelain"];
  if (startLine !== undefined || endLine !== undefined) {
    args.push("-L", `${startLine ?? 1},${endLine ?? ""}`);
  }
  if (ref) args.push(gitArg("ref", ref));
  // After "--", a path that starts with "-" stays a path
  args.push("--", path);

  const output = await git(args, { cwd, signal: ctx.signal });
  return { path, lines: parseBlame(output) };
}
