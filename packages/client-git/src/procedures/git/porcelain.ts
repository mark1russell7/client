/**
 * The status letters of git, and a parser of `git status --porcelain=v1 -z`.
 *
 * With `-z`, git writes each path as it is: no quotes. A rename or a copy gives its new path in
 * the entry, and its old path in the next field.
 */

import { zFields } from "./run.js";
import type { GitStatusFile } from "../../types.js";

/** One entry of `git status --porcelain=v1 -z`. */
export interface GitPorcelainEntry extends GitStatusFile {
  /** The two status letters: the index, then the work tree. "??" is untracked and "!!" is ignored. */
  xy: string;
}

/** The status letters of a path with a conflict (git status, "Short Format"). */
const UNMERGED = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);

/** This function gives the status of one entry from its two status letters (index, then work tree). */
export function classifyStatus(xy: string): Pick<GitStatusFile, "status" | "staged"> {
  if (xy === "??") return { status: "untracked", staged: false };
  if (xy === "!!") return { status: "ignored", staged: false };
  if (UNMERGED.has(xy)) return { status: "modified", staged: false };
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

/**
 * This function reads the output of `git status --porcelain=v1 -z`. Each entry has its status
 * letters, its exact path, and for a rename or a copy the old path in `from`. It skips the
 * branch line of `--branch`.
 *
 * @example
 * ```ts
 * const output = await git(["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", "notes"]);
 * const untracked = parsePorcelainV1(output).filter((entry) => entry.status === "untracked");
 * ```
 */
export function parsePorcelainV1(output: string): GitPorcelainEntry[] {
  const fields = zFields(output);
  const entries: GitPorcelainEntry[] = [];
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]!;
    // "XY path": two letters, a space, then the path. "## branch" is the line of --branch.
    if (field.length < 4 || field[2] !== " " || field.startsWith("## ")) continue;
    const xy = field.slice(0, 2);
    const entry: GitPorcelainEntry = { xy, path: field.slice(3), ...classifyStatus(xy) };
    // A rename or a copy, in the index or in the work tree, gives its old path in the next field
    if (!UNMERGED.has(xy) && /[RC]/.test(xy)) entry.from = fields[++i] ?? "";
    entries.push(entry);
  }
  return entries;
}
