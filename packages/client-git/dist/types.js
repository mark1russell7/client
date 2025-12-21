/**
 * Type definitions for client-git procedures
 */
import { z } from "zod";
// =============================================================================
// git.status Types - Get git status
// =============================================================================
export const GitStatusInputSchema = z.object({
    /** Working directory (default: process.cwd()) */
    cwd: z.string().optional(),
    /** Show short format (default: false) */
    short: z.boolean().optional().default(false),
});
// =============================================================================
// git.add Types - Stage files
// =============================================================================
export const GitAddInputSchema = z.object({
    /** Paths to stage (default: []) */
    paths: z.array(z.string()).optional().default([]),
    /** Stage all changes (default: false) */
    all: z.boolean().optional().default(false),
    /** Working directory */
    cwd: z.string().optional(),
});
// =============================================================================
// git.commit Types - Create commit
// =============================================================================
export const GitCommitInputSchema = z.object({
    /** Commit message */
    message: z.string(),
    /** Automatically stage modified files (default: false) */
    all: z.boolean().optional().default(false),
    /** Amend the last commit (default: false) */
    amend: z.boolean().optional().default(false),
    /** Working directory */
    cwd: z.string().optional(),
});
// =============================================================================
// git.push Types - Push to remote
// =============================================================================
export const GitPushInputSchema = z.object({
    /** Remote name (default: origin) */
    remote: z.string().optional().default("origin"),
    /** Branch to push (default: current branch) */
    branch: z.string().optional(),
    /** Force push (default: false) */
    force: z.boolean().optional().default(false),
    /** Set upstream tracking (default: false) */
    setUpstream: z.boolean().optional().default(false),
    /** Working directory */
    cwd: z.string().optional(),
});
// =============================================================================
// git.pull Types - Pull from remote
// =============================================================================
export const GitPullInputSchema = z.object({
    /** Remote name (default: origin) */
    remote: z.string().optional().default("origin"),
    /** Branch to pull (default: current branch) */
    branch: z.string().optional(),
    /** Rebase instead of merge (default: false) */
    rebase: z.boolean().optional().default(false),
    /** Working directory */
    cwd: z.string().optional(),
});
// =============================================================================
// git.clone Types - Clone repository
// =============================================================================
export const GitCloneInputSchema = z.object({
    /** Repository URL */
    url: z.string(),
    /** Destination directory (default: derived from URL) */
    dest: z.string().optional(),
    /** Branch to clone (default: default branch) */
    branch: z.string().optional(),
    /** Create shallow clone with depth (default: full clone) */
    depth: z.number().optional(),
    /** Working directory */
    cwd: z.string().optional(),
});
// =============================================================================
// git.checkout Types - Checkout branch or files
// =============================================================================
export const GitCheckoutInputSchema = z.object({
    /** Branch, tag, or commit to checkout */
    ref: z.string(),
    /** Create branch if it doesn't exist (default: false) */
    create: z.boolean().optional().default(false),
    /** Specific paths to checkout (default: all) */
    paths: z.array(z.string()).optional(),
    /** Working directory */
    cwd: z.string().optional(),
});
// =============================================================================
// git.branch Types - Branch operations
// =============================================================================
export const GitBranchInputSchema = z.object({
    /** Branch name (for create/delete) */
    name: z.string().optional(),
    /** Delete the branch (default: false) */
    delete: z.boolean().optional().default(false),
    /** List branches (default: true if no name provided) */
    list: z.boolean().optional().default(false),
    /** Include remote branches in list (default: false) */
    remote: z.boolean().optional().default(false),
    /** Working directory */
    cwd: z.string().optional(),
});
// =============================================================================
// git.log Types - Show commit log
// =============================================================================
export const GitLogInputSchema = z.object({
    /** Number of commits to show (default: 10) */
    count: z.number().optional().default(10),
    /** One line per commit (default: false) */
    oneline: z.boolean().optional().default(false),
    /** Branch/tag/commit to start from (default: HEAD) */
    ref: z.string().optional(),
    /** Working directory */
    cwd: z.string().optional(),
});
// =============================================================================
// git.diff Types - Show changes
// =============================================================================
export const GitDiffInputSchema = z.object({
    /** Show staged changes (default: false, shows unstaged) */
    staged: z.boolean().optional().default(false),
    /** Compare against ref (branch/commit) */
    ref: z.string().optional(),
    /** Specific paths to diff */
    paths: z.array(z.string()).optional(),
    /** Show stat summary only (default: false) */
    stat: z.boolean().optional().default(false),
    /** Working directory */
    cwd: z.string().optional(),
});
// =============================================================================
// git.init Types - Initialize a git repository
// =============================================================================
export const GitInitInputSchema = z.object({
    /** Directory to initialize (default: process.cwd()) */
    cwd: z.string().optional(),
    /** Create a bare repository (default: false) */
    bare: z.boolean().optional().default(false),
    /** Name for the initial branch */
    initialBranch: z.string().optional(),
});
// =============================================================================
// git.remote Types - Get or set remote URLs
// =============================================================================
export const GitRemoteInputSchema = z.object({
    /** Remote name (default: origin) */
    name: z.string().optional().default("origin"),
    /** New URL to set (if provided, sets the URL; otherwise gets it) */
    url: z.string().optional(),
    /** Working directory */
    cwd: z.string().optional(),
});
// =============================================================================
// git.fetch Types - Fetch from remote
// =============================================================================
export const GitFetchInputSchema = z.object({
    /** Remote name (default: origin) */
    remote: z.string().optional().default("origin"),
    /** Specific branch to fetch (default: all) */
    branch: z.string().optional(),
    /** Fetch all remotes (default: false) */
    all: z.boolean().optional().default(false),
    /** Prune deleted branches (default: false) */
    prune: z.boolean().optional().default(false),
    /** Working directory */
    cwd: z.string().optional(),
});
// =============================================================================
// git.* Predicate Types
// =============================================================================
export const GitPredicateInputSchema = z.object({
    /** Working directory (default: process.cwd()) */
    cwd: z.string().optional(),
});
//# sourceMappingURL=types.js.map