/**
 * git.worktree.list procedure
 *
 * List the working trees of the repository (roadmap R40). The main working tree is first.
 */

import { resolve } from "node:path";
import { git, zFields, type GitContext } from "../run.js";
import type { GitWorktreeInfo, GitWorktreeListInput, GitWorktreeListOutput } from "../../../types.js";

/**
 * This function reads the output of `git worktree list --porcelain -z`: the fields of one working
 * tree, then an empty field.
 */
export function parseWorktrees(output: string): GitWorktreeInfo[] {
  const worktrees: GitWorktreeInfo[] = [];
  let current: GitWorktreeInfo | undefined;
  for (const field of zFields(output)) {
    if (field === "") {
      current = undefined;
      continue;
    }
    const space = field.indexOf(" ");
    const key = space < 0 ? field : field.slice(0, space);
    const value = space < 0 ? "" : field.slice(space + 1);
    if (key === "worktree") {
      // Git gives "/" on Windows too: resolve gives the path of the platform
      current = { path: resolve(value), detached: false, bare: false, locked: false, prunable: false };
      worktrees.push(current);
    } else if (current) {
      if (key === "HEAD") current.head = value;
      else if (key === "branch") current.branch = value.replace(/^refs\/heads\//, "");
      else if (key === "detached") current.detached = true;
      else if (key === "bare") current.bare = true;
      else if (key === "locked") current.locked = true;
      else if (key === "prunable") current.prunable = true;
    }
  }
  return worktrees;
}

/**
 * List the working trees of the repository
 */
export async function gitWorktreeList(input: GitWorktreeListInput, ctx: GitContext = {}): Promise<GitWorktreeListOutput> {
  const output = await git(["worktree", "list", "--porcelain", "-z"], { cwd: input.cwd, signal: ctx.signal });
  return { worktrees: parseWorktrees(output) };
}
