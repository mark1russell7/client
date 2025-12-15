/**
 * Git operations utilities
 */
import { exec } from "node:child_process";
import { promisify } from "node:util";
const execAsync = promisify(exec);
/**
 * Execute a git command in a specific directory
 */
async function git(cwd, args) {
    try {
        return await execAsync(`git ${args}`, { cwd });
    }
    catch (error) {
        const execError = error;
        throw new Error(`Git command failed: git ${args}\n${execError.stderr ?? execError.message}`);
    }
}
/**
 * Get the current branch name
 */
export async function getCurrentBranch(repoPath) {
    const { stdout } = await git(repoPath, "rev-parse --abbrev-ref HEAD");
    return stdout.trim();
}
/**
 * Get the git status of a repository
 */
export async function getGitStatus(repoPath) {
    const currentBranch = await getCurrentBranch(repoPath);
    // Check for uncommitted changes
    const { stdout: statusOutput } = await git(repoPath, "status --porcelain");
    const lines = statusOutput.trim().split("\n").filter(Boolean);
    const hasStagedChanges = lines.some((line) => line.startsWith("A ") || line.startsWith("M ") || line.startsWith("D "));
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
export async function getRemoteUrl(repoPath) {
    try {
        const { stdout } = await git(repoPath, "remote get-url origin");
        return stdout.trim() || undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * Stage all changes
 */
export async function stageAll(repoPath) {
    await git(repoPath, "add -A");
}
/**
 * Commit with a message
 */
export async function commit(repoPath, message) {
    // Escape quotes in the message
    const escapedMessage = message.replace(/"/g, '\\"');
    await git(repoPath, `commit -m "${escapedMessage}"`);
}
/**
 * Push to remote
 */
export async function push(repoPath) {
    await git(repoPath, "push");
}
/**
 * Checkout a branch
 */
export async function checkout(repoPath, branch) {
    await git(repoPath, `checkout ${branch}`);
}
/**
 * Pull from remote
 */
export async function pull(repoPath) {
    await git(repoPath, "pull");
}
/**
 * Check if a branch exists locally
 */
export async function branchExists(repoPath, branch) {
    try {
        await git(repoPath, `rev-parse --verify ${branch}`);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Ensure the repo is on the correct branch
 * If not on the correct branch:
 * 1. Commit any staged changes
 * 2. Stage and commit any unstaged changes
 * 3. Checkout the required branch
 */
export async function ensureBranch(repoPath, requiredBranch) {
    const status = await getGitStatus(repoPath);
    const commits = [];
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
//# sourceMappingURL=operations.js.map