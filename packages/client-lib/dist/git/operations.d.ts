/**
 * Git operations utilities
 *
 * Uses ctx.client.call() to invoke git.* procedures for dogfooding.
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { GitStatus } from "../types.js";
/**
 * Get the current branch name
 */
export declare function getCurrentBranch(repoPath: string, ctx: ProcedureContext): Promise<string>;
/**
 * Get the git status of a repository
 */
export declare function getGitStatus(repoPath: string, ctx: ProcedureContext): Promise<GitStatus>;
/**
 * Get the remote URL of a repository
 */
export declare function getRemoteUrl(repoPath: string, ctx: ProcedureContext): Promise<string | undefined>;
/**
 * Stage all changes
 */
export declare function stageAll(repoPath: string, ctx: ProcedureContext): Promise<void>;
/**
 * Commit with a message
 */
export declare function commit(repoPath: string, message: string, ctx: ProcedureContext): Promise<void>;
/**
 * Push to remote
 */
export declare function push(repoPath: string, ctx: ProcedureContext): Promise<void>;
/**
 * Checkout a branch
 */
export declare function checkout(repoPath: string, branch: string, ctx: ProcedureContext): Promise<void>;
/**
 * Pull from remote
 */
export declare function pull(repoPath: string, ctx: ProcedureContext): Promise<void>;
/**
 * Check if a branch exists locally
 */
export declare function branchExists(repoPath: string, branch: string, ctx: ProcedureContext): Promise<boolean>;
/**
 * Clone a repository
 */
export declare function clone(url: string, targetPath: string, ctx: ProcedureContext, branch?: string): Promise<void>;
/**
 * Ensure the repo is on the correct branch
 * If not on the correct branch:
 * 1. Commit any staged changes
 * 2. Stage and commit any unstaged changes
 * 3. Checkout the required branch
 */
export declare function ensureBranch(repoPath: string, requiredBranch: string, ctx: ProcedureContext): Promise<{
    switched: boolean;
    commits: string[];
}>;
//# sourceMappingURL=operations.d.ts.map