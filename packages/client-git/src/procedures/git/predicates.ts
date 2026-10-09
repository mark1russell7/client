/**
 * Git predicate procedures
 *
 * Simple boolean predicates for conditional execution.
 * These return true/false based on git repository state.
 */

import { git, GitError, type GitContext } from "./run.js";

export interface GitPredicateInput {
  /** Working directory (default: process.cwd()) */
  cwd?: string | undefined;
}

export interface GitPredicateOutput {
  /** The predicate result */
  value: boolean;
}

/**
 * The output of a git command, or null when git fails (for example outside a repository).
 * An aborted signal still throws.
 */
async function gitOrNull(args: string[], cwd: string | undefined, ctx: GitContext): Promise<string | null> {
  try {
    return (await git(args, { cwd, signal: ctx.signal })).trim();
  } catch (error) {
    if (error instanceof GitError) return null;
    throw error;
  }
}

/**
 * Check if there are any changes (unstaged, staged, or untracked)
 */
export async function gitHasChanges(input: GitPredicateInput, ctx: GitContext = {}): Promise<GitPredicateOutput> {
  const status = await gitOrNull(["status", "--porcelain"], input.cwd, ctx);
  return { value: status !== null && status.length > 0 };
}

/**
 * Check if there are any staged changes ready to commit
 */
export async function gitHasStagedChanges(input: GitPredicateInput, ctx: GitContext = {}): Promise<GitPredicateOutput> {
  // git diff --cached shows only staged changes
  const diff = await gitOrNull(["diff", "--cached", "--name-only"], input.cwd, ctx);
  return { value: diff !== null && diff.length > 0 };
}

/**
 * Check if there are any unstaged changes (modified or deleted files)
 */
export async function gitHasUnstagedChanges(input: GitPredicateInput, ctx: GitContext = {}): Promise<GitPredicateOutput> {
  // git diff shows only unstaged changes to tracked files
  const diff = await gitOrNull(["diff", "--name-only"], input.cwd, ctx);
  return { value: diff !== null && diff.length > 0 };
}

/**
 * Check if there are any untracked files
 */
export async function gitHasUntrackedFiles(input: GitPredicateInput, ctx: GitContext = {}): Promise<GitPredicateOutput> {
  // List untracked files only
  const untracked = await gitOrNull(["ls-files", "--others", "--exclude-standard"], input.cwd, ctx);
  return { value: untracked !== null && untracked.length > 0 };
}

/**
 * Check if there are local commits that haven't been pushed
 */
export async function gitHasLocalCommits(input: GitPredicateInput, ctx: GitContext = {}): Promise<GitPredicateOutput> {
  // Get the upstream tracking branch
  const upstream = await gitOrNull(["rev-parse", "--abbrev-ref", "@{upstream}"], input.cwd, ctx);
  if (upstream !== null) {
    // Count commits ahead of upstream
    const count = await gitOrNull(["rev-list", "--count", `${upstream}..HEAD`], input.cwd, ctx);
    if (count !== null) return { value: parseInt(count, 10) > 0 };
  }
  // No upstream or error - HEAD exists but no upstream: treat as having local commits
  const head = await gitOrNull(["rev-parse", "HEAD"], input.cwd, ctx);
  return { value: head !== null };
}

/**
 * Check if the working directory is clean (no changes at all)
 */
export async function gitIsClean(input: GitPredicateInput, ctx: GitContext = {}): Promise<GitPredicateOutput> {
  const result = await gitHasChanges(input, ctx);
  return { value: !result.value };
}
