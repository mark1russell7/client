/**
 * Git operations utilities
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { GitStatus } from "../types.js";

const execAsync = promisify(exec);

/**
 * Execute a git command in a specific directory
 */
async function git(
  cwd: string,
  args: string
): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execAsync(`git ${args}`, { cwd });
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string; message: string };
    throw new Error(
      `Git command failed: git ${args}\n${execError.stderr ?? execError.message}`
    );
  }
}

/**
 * Get the current branch name
 */
export async function getCurrentBranch(repoPath: string): Promise<string> {
  const { stdout } = await git(repoPath, "rev-parse --abbrev-ref HEAD");
  return stdout.trim();
}

/**
 * Get the git status of a repository
 */
export async function getGitStatus(repoPath: string): Promise<GitStatus> {
  const currentBranch = await getCurrentBranch(repoPath);

  // Check for uncommitted changes
  const { stdout: statusOutput } = await git(repoPath, "status --porcelain");
  const lines = statusOutput.trim().split("\n").filter(Boolean);

  const hasStagedChanges = lines.some(
    (line) => line.startsWith("A ") || line.startsWith("M ") || line.startsWith("D ")
  );
  const hasUncommittedChanges = lines.length > 0;
  const isClean = lines.length === 0;

  return {
    currentBranch,
    hasStagedChanges,
    hasUncommittedChanges,
    isClean,
  };
}

/**
 * Get the remote URL of a repository
 */
export async function getRemoteUrl(repoPath: string): Promise<string | undefined> {
  try {
    const { stdout } = await git(repoPath, "remote get-url origin");
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Stage all changes
 */
export async function stageAll(repoPath: string): Promise<void> {
  await git(repoPath, "add -A");
}

/**
 * Commit with a message
 */
export async function commit(repoPath: string, message: string): Promise<void> {
  // Escape quotes in the message
  const escapedMessage = message.replace(/"/g, '\\"');
  await git(repoPath, `commit -m "${escapedMessage}"`);
}

/**
 * Push to remote
 */
export async function push(repoPath: string): Promise<void> {
  await git(repoPath, "push");
}

/**
 * Checkout a branch
 */
export async function checkout(repoPath: string, branch: string): Promise<void> {
  await git(repoPath, `checkout ${branch}`);
}

/**
 * Pull from remote
 */
export async function pull(repoPath: string): Promise<void> {
  await git(repoPath, "pull");
}

/**
 * Check if a branch exists locally
 */
export async function branchExists(
  repoPath: string,
  branch: string
): Promise<boolean> {
  try {
    await git(repoPath, `rev-parse --verify ${branch}`);
    return true;
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
  branch?: string
): Promise<void> {
  const branchArg = branch ? `-b ${branch}` : "";
  await execAsync(`git clone ${branchArg} ${url} "${targetPath}"`);
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
  requiredBranch: string
): Promise<{ switched: boolean; commits: string[] }> {
  const status = await getGitStatus(repoPath);
  const commits: string[] = [];

  if (status.currentBranch === requiredBranch) {
    return { switched: false, commits };
  }

  // Commit any staged changes first
  if (status.hasStagedChanges) {
    await commit(repoPath, "WIP: Auto-commit staged changes before branch switch");
    commits.push("Committed staged changes");
  }

  // Stage and commit any remaining changes
  const statusAfter = await getGitStatus(repoPath);
  if (statusAfter.hasUncommittedChanges) {
    await stageAll(repoPath);
    await commit(repoPath, "WIP: Auto-commit all changes before branch switch");
    commits.push("Committed all changes");
  }

  // Checkout the required branch
  await checkout(repoPath, requiredBranch);
  commits.push(`Switched to branch ${requiredBranch}`);

  return { switched: true, commits };
}
