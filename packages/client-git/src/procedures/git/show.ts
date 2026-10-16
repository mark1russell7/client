/**
 * git.show procedure
 *
 * Show a commit, or a file at a commit (roadmap R40).
 *
 * The procedure first resolves the ref to its commit, so a tag gives its commit and not the text
 * of the tag object. A merge commit gives its changes against its first parent.
 */

import { parseNumstat } from "./diff.js";
import { git, type GitContext } from "./run.js";
import { commitOf } from "./refs.js";
import type { GitShowInput, GitShowOutput } from "../../types.js";

// Control characters that do not occur in a name, an email, a date or a subject
const FIELD = "\x1f";

/**
 * Show a commit, or a file at a commit
 */
export async function gitShow(input: GitShowInput, ctx: GitContext = {}): Promise<GitShowOutput> {
  const ref = input.ref ?? "HEAD";
  const run = { cwd: input.cwd, signal: ctx.signal };
  const hash = await commitOf(ref, run);

  // A file at the commit: `<hash>:<path>` starts with the hash, so a path that starts with "-"
  // stays a path
  if (input.path !== undefined) {
    const content = await git(["show", `${hash}:${input.path}`], run);
    return { ref, hash, path: input.path, content };
  }

  const format = `--format=${["%H", "%h", "%an", "%ae", "%ci", "%s", "%b"].join("%x1f")}`;
  const [, shortHash = "", author = "", email = "", date = "", message = "", body = ""] = (
    await git(["show", "-s", format, hash], run)
  ).split(FIELD);

  const changes = ["show", "--format=", "--diff-merges=first-parent"];
  const files = parseNumstat(await git([...changes, "--numstat", "-z", hash], run));
  const result: GitShowOutput = {
    ref,
    hash,
    shortHash,
    author,
    email,
    date,
    message,
    body: body.replace(/\n+$/, ""),
    files,
    additions: files.reduce((sum, file) => sum + file.additions, 0),
    deletions: files.reduce((sum, file) => sum + file.deletions, 0),
  };
  if (!input.stat) {
    result.diff = (await git([...changes, "--patch", hash], run)).replace(/^\n/, "");
  }
  return result;
}
