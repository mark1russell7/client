/**
 * Git operations utilities
 *
 * Uses ctx.client.call() to invoke git.* procedures for dogfooding.
 */
/**
 * Get the current branch name
 */
export async function getCurrentBranch(repoPath, ctx) {
    const result = await ctx.client.call(["git", "status"], { cwd: repoPath });
    return result.branch;
}
/**
 * Get the git status of a repository
 */
export async function getGitStatus(repoPath, ctx) {
    const result = await ctx.client.call(["git", "status"], { cwd: repoPath });
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
export async function getRemoteUrl(repoPath, ctx) {
    try {
        const result = await ctx.client.call(["git", "remote"], { cwd: repoPath, name: "origin" });
        return result.url ?? undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * Stage all changes
 */
export async function stageAll(repoPath, ctx) {
    await ctx.client.call(["git", "add"], { all: true, cwd: repoPath });
}
/**
 * Commit with a message
 */
export async function commit(repoPath, message, ctx) {
    await ctx.client.call(["git", "commit"], { message, cwd: repoPath });
}
/**
 * Push to remote
 */
export async function push(repoPath, ctx) {
    await ctx.client.call(["git", "push"], { cwd: repoPath });
}
/**
 * Checkout a branch
 */
export async function checkout(repoPath, branch, ctx) {
    await ctx.client.call(["git", "checkout"], { ref: branch, cwd: repoPath });
}
/**
 * Pull from remote
 */
export async function pull(repoPath, ctx) {
    await ctx.client.call(["git", "pull"], { cwd: repoPath });
}
/**
 * Check if a branch exists locally
 */
export async function branchExists(repoPath, branch, ctx) {
    try {
        // Use git.branch to list branches and check if it exists
        const result = await ctx.client.call(["git", "branch"], { cwd: repoPath });
        return result.branches.some((b) => b.name === branch);
    }
    catch {
        return false;
    }
}
/**
 * Clone a repository
 */
export async function clone(url, targetPath, ctx, branch) {
    const input = { url, dest: targetPath };
    if (branch) {
        input.branch = branch;
    }
    await ctx.client.call(["git", "clone"], input);
}
/**
 * Ensure the repo is on the correct branch
 * If not on the correct branch:
 * 1. Commit any staged changes
 * 2. Stage and commit any unstaged changes
 * 3. Checkout the required branch
 */
export async function ensureBranch(repoPath, requiredBranch, ctx) {
    const status = await getGitStatus(repoPath, ctx);
    const commits = [];
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
//# sourceMappingURL=operations.js.map