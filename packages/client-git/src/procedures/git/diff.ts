/**
 * git.diff procedure
 *
 * Show changes
 *
 * The counts come from `git diff --numstat -z`. With `-z`, each path is exact, and a rename gives
 * the old and the new path in separate fields (deep dive WRP-7). Before, the procedure split each
 * line at whitespace: a path with a space lost its end, and a rename gave its old path only.
 */

import { gitArg } from "./args.js";
import { git, zFields, type GitContext } from "./run.js";
import type { GitDiffInput, GitDiffOutput, GitDiffFile } from "../../types.js";

/** This function reads the output of `git diff --numstat -z`. */
export function parseNumstat(output: string): GitDiffFile[] {
  const files: GitDiffFile[] = [];
  const fields = zFields(output);
  for (let i = 0; i < fields.length; i++) {
    const [add = "0", del = "0", ...rest] = fields[i]!.split("\t");
    // A binary file has "-" for both counts
    const additions = add === "-" ? 0 : parseInt(add, 10);
    const deletions = del === "-" ? 0 : parseInt(del, 10);
    const path = rest.join("\t");
    if (path === "") {
      // A rename or a copy: the old path, then the new path, in the next two fields
      const from = fields[++i] ?? "";
      const to = fields[++i] ?? "";
      files.push({ path: to, from, additions, deletions });
    } else {
      files.push({ path, additions, deletions });
    }
  }
  return files;
}

/**
 * Show changes
 */
export async function gitDiff(input: GitDiffInput, ctx: GitContext = {}): Promise<GitDiffOutput> {
  const { staged, ref, paths, stat, cwd } = input;
  const run = { cwd, signal: ctx.signal };

  const selection: string[] = [];
  if (staged) selection.push("--cached");
  if (ref) selection.push(gitArg("ref", ref));
  const pathspec = paths && paths.length > 0 ? ["--", ...paths] : [];

  const files = parseNumstat(await git(["diff", ...selection, "--numstat", "-z", ...pathspec], run));
  const result: GitDiffOutput = {
    files,
    additions: files.reduce((sum, file) => sum + file.additions, 0),
    deletions: files.reduce((sum, file) => sum + file.deletions, 0),
  };

  // Include full diff if not stat-only
  if (!stat) {
    result.diff = await git(["diff", ...selection, ...pathspec], run);
  }

  return result;
}
