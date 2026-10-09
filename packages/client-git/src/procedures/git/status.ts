/**
 * git.status procedure
 *
 * Get git status
 *
 * One call of `git status --porcelain=v2 --branch -z` gives the branch, the ahead and behind
 * counts and the files. With `-z`, git writes each path as it is: no quotes, and a rename gives
 * its old path in a separate field (deep dive WRP-7). Before, the procedure read the quoted form,
 * so a path with a space kept its quotes, and a rename gave the text "old -> new" as the path.
 */

import { git, zFields, type GitContext } from "./run.js";
import type { GitStatusInput, GitStatusOutput, GitStatusFile } from "../../types.js";

/** The status of one entry, from its two status letters (index, then work tree). */
function classify(xy: string): Pick<GitStatusFile, "status" | "staged"> {
  const index = xy[0];
  const worktree = xy[1];
  if (index === "A") return { status: "added", staged: true };
  if (index === "D") return { status: "deleted", staged: true };
  if (index === "R") return { status: "renamed", staged: true };
  if (index === "C") return { status: "copied", staged: true };
  if (index === "M" || index === "T") return { status: "modified", staged: true };
  if (worktree === "D") return { status: "deleted", staged: false };
  if (worktree === "A") return { status: "added", staged: false };
  if (worktree === "R") return { status: "renamed", staged: false };
  return { status: "modified", staged: false };
}

/** The text after the first `count` space-separated fields of a line. */
function afterFields(line: string, count: number): string {
  let at = 0;
  for (let i = 0; i < count; i++) at = line.indexOf(" ", at) + 1;
  return line.slice(at);
}

/**
 * Get git status
 */
export async function gitStatus(input: GitStatusInput, ctx: GitContext = {}): Promise<GitStatusOutput> {
  const output = await git(["status", "--porcelain=v2", "--branch", "-z"], { cwd: input.cwd, signal: ctx.signal });

  let branch = "HEAD";
  let ahead = 0;
  let behind = 0;
  const files: GitStatusFile[] = [];
  const lines: string[] = [];

  const fields = zFields(output);
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]!;
    if (field.startsWith("# branch.head ")) {
      const head = field.slice("# branch.head ".length);
      branch = head === "(detached)" ? "HEAD" : head;
    } else if (field.startsWith("# branch.ab ")) {
      const match = /\+(\d+) -(\d+)/.exec(field);
      ahead = Number(match?.[1] ?? 0);
      behind = Number(match?.[2] ?? 0);
    } else if (field.startsWith("1 ")) {
      // 1 XY sub mH mI mW hH hI path
      const xy = field.slice(2, 4);
      const path = afterFields(field, 8);
      files.push({ path, ...classify(xy) });
      lines.push(`${xy.replace(/\./g, " ")} ${path}`);
    } else if (field.startsWith("2 ")) {
      // 2 XY sub mH mI mW hH hI Xscore path, then the old path in the next field
      const xy = field.slice(2, 4);
      const path = afterFields(field, 9);
      const from = fields[++i] ?? "";
      files.push({ path, from, ...classify(xy) });
      lines.push(`${xy.replace(/\./g, " ")} ${from} -> ${path}`);
    } else if (field.startsWith("u ")) {
      // An unmerged path: u XY sub m1 m2 m3 mW h1 h2 h3 path
      const xy = field.slice(2, 4);
      const path = afterFields(field, 10);
      files.push({ path, status: "modified", staged: false });
      lines.push(`${xy} ${path}`);
    } else if (field.startsWith("? ")) {
      const path = field.slice(2);
      files.push({ path, status: "untracked", staged: false });
      lines.push(`?? ${path}`);
    } else if (field.startsWith("! ")) {
      const path = field.slice(2);
      files.push({ path, status: "ignored", staged: false });
      lines.push(`!! ${path}`);
    }
  }

  const result: GitStatusOutput = {
    branch,
    ahead,
    behind,
    files,
    clean: files.length === 0,
  };
  if (input.short) result.lines = lines;
  return result;
}
