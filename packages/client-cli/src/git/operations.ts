/**
 * Git operations utilities
 *
 * Uses ctx.client.call() to invoke git.* procedures for dogfooding.
 */

import type { ProcedureContext } from "@mark1russell7/client";
import type { GitStatus } from "../types.js";

// =============================================================================
// Git Procedure Output Types
// =============================================================================

interface GitStatusOutput {
  branch: string;
  ahead: number;
  behind: number;
  files: Array<{ path: string; status: string; staged: boolean }>;
  clean: boolean;
}

interface GitAddOutput {
  staged: string[];
}

interface GitCommitOutput {
  hash: string;
  message: string;
}

interface GitPushOutput {
  remote: string;
  branch: string;
}

interface GitCloneOutput {
  path: string;
  branch: string;
}

interface GitCheckoutOutput {
  ref: string;
  created: boolean;
}

interface GitRemoteOutput {
  url: string | null;
}

/**
 * Get the current branch name
 */
export async function getCurrentBranch(repoPath: string, ctx: ProcedureContext): Promise<string> {
  const result = await ctx.client.call<{ cwd?: string }, GitStatusOutput>(
    ["git", "status"],
    { cwd: repoPath }
  );
  return result.branch;
}

/**
 * Get the git status of a repository
 */
export async function getGitStatus(repoPath: string, ctx: ProcedureContext): Promise<GitStatus> {
  const result = await ctx.client.call<{ cwd?: string }, GitStatusOutput>(
    ["git", "status"],
    { cwd: repoPath }
  );

  const hasStagedChanges = result.files.some((f) => f.staged);
  const hasUncommittedChanges = result.files.length > 0;

  return {
    currentBranch: result.branch,
    hasStagedChanges,
    hasUncommittedChanges,
    isClean: result.clean,
  };
}

/**
 * Get the remote URL of a repository
 */
export async function getRemoteUrl(repoPath: string, ctx: ProcedureContext): Promise<string | undefined> {
  try {
    const result = await ctx.client.call<{ cwd?: string; name?: string }, GitRemoteOutput>(
      ["git", "remote"],
      { cwd: repoPath, name: "origin" }
    );
    return result.url ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Stage all changes
 */
export async function stageAll(repoPath: string, ctx: ProcedureContext): Promise<void> {
  await ctx.client.call<{ all?: boolean; cwd?: string }, GitAddOutput>(
    ["git", "add"],
    { all: true, cwd: repoPath }
  );
}

/**
 * Commit with a message
 */
export async function commit(repoPath: string, message: string, ctx: ProcedureContext): Promise<void> {
  await ctx.client.call<{ message: string; cwd?: string }, GitCommitOutput>(
    ["git", "commit"],
    { message, cwd: repoPath }
  );
}

/**
 * Push to remote
 */
export async function push(repoPath: string, ctx: ProcedureContext): Promise<void> {
  await ctx.client.call<{ cwd?: string }, GitPushOutput>(
    ["git", "push"],
    { cwd: repoPath }
  );
}

/**
 * Checkout a branch
 */
export async function checkout(repoPath: string, branch: string, ctx: ProcedureContext): Promise<void> {
  await ctx.client.call<{ ref: string; cwd?: string }, GitCheckoutOutput>(
    ["git", "checkout"],
    { ref: branch, cwd: repoPath }
  );
}

/**
 * Pull from remote
 */
export async function pull(repoPath: string, ctx: ProcedureContext): Promise<void> {
  await ctx.client.call<{ cwd?: string }, GitPushOutput>(
    ["git", "pull"],
    { cwd: repoPath }
  );
}

/**
 * Check if a branch exists locally
 */
export async function branchExists(
  repoPath: string,
  branch: string,
  ctx: ProcedureContext
): Promise<boolean> {
  try {
    // Use git.branch to list branches and check if it exists
    const result = await ctx.client.call<{ cwd?: string }, { branches: Array<{ name: string }> }>(
      ["git", "branch"],
      { cwd: repoPath }
    );
    return result.branches.some((b) => b.name === branch);
  } catch {
    return false;
  }
}

/**
 * Clone a repository
 */
export async function clone(
  url: string,
  targetPath: string,
  ctx: ProcedureContext,
  branch?: string
): Promise<void> {
  const input: { url: string; dest: string; branch?: string } = { url, dest: targetPath };
  if (branch) {
    input.branch = branch;
  }
  await ctx.client.call<{ url: string; dest?: string; branch?: string }, GitCloneOutput>(
    ["git", "clone"],
    input
  );
}

/**
 * Ensure the repo is on the correct branch
 * If not on the correct branch:
 * 1. Commit any staged changes
 * 2. Stage and commit any unstaged changes
 * 3. Checkout the required branch
 */
export async function ensureBranch(
  repoPath: string,
  requiredBranch: string,
  ctx: ProcedureContext
): Promise<{ switched: boolean; commits: string[] }> {
  const status = await getGitStatus(repoPath, ctx);
  const commits: string[] = [];

  if (status.currentBranch === requiredBranch) {
    return { switched: false, commits };
  }

  // Commit any staged changes first
  if (status.hasStagedChanges) {
    await commit(repoPath, "WIP: Auto-commit staged changes before branch switch", ctx);
    commits.push("Committed staged changes");
  }

  // Stage and commit any remaining changes
  const statusAfter = await getGitStatus(repoPath, ctx);
  if (statusAfter.hasUncommittedChanges) {
    await stageAll(repoPath, ctx);
    await commit(repoPath, "WIP: Auto-commit all changes before branch switch", ctx);
    commits.push("Committed all changes");
  }

  // Checkout the required branch
  await checkout(repoPath, requiredBranch, ctx);
  commits.push(`Switched to branch ${requiredBranch}`);

  return { switched: true, commits };
}
