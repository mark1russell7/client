/**
 * git.worktree.add procedure
 *
 * Add a working tree (roadmap R40). Git refuses a folder that exists and is not empty. Without
 * `ref`, `branch` and `detach`, git makes a branch with the name of the folder.
 */

import { resolve } from "node:path";
import { gitArg } from "../args.js";
import { git, type GitContext } from "../run.js";
import { currentBranch, headHash } from "../refs.js";
import type { GitWorktreeAddInput, GitWorktreeAddOutput } from "../../../types.js";

/**
 * Add a working tree
 */
export async function gitWorktreeAdd(input: GitWorktreeAddInput, ctx: GitContext = {}): Promise<GitWorktreeAddOutput> {
  const { ref, branch, detach, cwd } = input;
  const path = resolve(cwd ?? process.cwd(), input.path);

  const args = ["worktree", "add"];
  if (branch) args.push("-b", gitArg("branch", branch));
  if (detach) args.push("--detach");
  // After "--", a path that starts with "-" stays a path
  args.push("--", path);
  if (ref) args.push(gitArg("ref", ref));
  await git(args, { cwd, signal: ctx.signal });

  // The new working tree gives its own HEAD
  const inTree = { cwd: path, signal: ctx.signal };
  const result: GitWorktreeAddOutput = { path, head: await headHash(inTree) };
  const checkedOut = await currentBranch(inTree);
  if (checkedOut !== "HEAD") result.branch = checkedOut;
  return result;
}
