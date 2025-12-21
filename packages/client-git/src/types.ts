/**
 * Type definitions for client-git procedures
 */

import { z } from "zod";

// =============================================================================
// git.status Types - Get git status
// =============================================================================

export const GitStatusInputSchema: z.ZodObject<{
  cwd: z.ZodOptional<z.ZodString>;
  short: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}> = z.object({
  /** Working directory (default: process.cwd()) */
  cwd: z.string().optional(),
  /** Show short format (default: false) */
  short: z.boolean().optional().default(false),
});

export type GitStatusInput = z.infer<typeof GitStatusInputSchema>;

export interface GitStatusFile {
  path: string;
  status: "modified" | "added" | "deleted" | "renamed" | "copied" | "untracked" | "ignored";
  staged: boolean;
}

export interface GitStatusOutput {
  branch: string;
  ahead: number;
  behind: number;
  files: GitStatusFile[];
  clean: boolean;
}

// =============================================================================
// git.add Types - Stage files
// =============================================================================

export const GitAddInputSchema: z.ZodObject<{
  paths: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString>>>;
  all: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Paths to stage (default: []) */
  paths: z.array(z.string()).optional().default([]),
  /** Stage all changes (default: false) */
  all: z.boolean().optional().default(false),
  /** Working directory */
  cwd: z.string().optional(),
});

export type GitAddInput = z.infer<typeof GitAddInputSchema>;

export interface GitAddOutput {
  staged: string[];
}

// =============================================================================
// git.commit Types - Create commit
// =============================================================================

export const GitCommitInputSchema: z.ZodObject<{
  message: z.ZodString;
  all: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
  amend: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Commit message */
  message: z.string(),
  /** Automatically stage modified files (default: false) */
  all: z.boolean().optional().default(false),
  /** Amend the last commit (default: false) */
  amend: z.boolean().optional().default(false),
  /** Working directory */
  cwd: z.string().optional(),
});

export type GitCommitInput = z.infer<typeof GitCommitInputSchema>;

export interface GitCommitOutput {
  hash: string;
  message: string;
  author: string;
  date: string;
  /** True if commit was skipped (nothing to commit) */
  skipped?: boolean;
}

// =============================================================================
// git.push Types - Push to remote
// =============================================================================

export const GitPushInputSchema: z.ZodObject<{
  remote: z.ZodDefault<z.ZodOptional<z.ZodString>>;
  branch: z.ZodOptional<z.ZodString>;
  force: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
  setUpstream: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
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

export type GitPushInput = z.infer<typeof GitPushInputSchema>;

export interface GitPushOutput {
  remote: string;
  branch: string;
  commits: number;
}

// =============================================================================
// git.pull Types - Pull from remote
// =============================================================================

export const GitPullInputSchema: z.ZodObject<{
  remote: z.ZodDefault<z.ZodOptional<z.ZodString>>;
  branch: z.ZodOptional<z.ZodString>;
  rebase: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Remote name (default: origin) */
  remote: z.string().optional().default("origin"),
  /** Branch to pull (default: current branch) */
  branch: z.string().optional(),
  /** Rebase instead of merge (default: false) */
  rebase: z.boolean().optional().default(false),
  /** Working directory */
  cwd: z.string().optional(),
});

export type GitPullInput = z.infer<typeof GitPullInputSchema>;

export interface GitPullOutput {
  remote: string;
  branch: string;
  commits: number;
  fastForward: boolean;
}

// =============================================================================
// git.clone Types - Clone repository
// =============================================================================

export const GitCloneInputSchema: z.ZodObject<{
  url: z.ZodString;
  dest: z.ZodOptional<z.ZodString>;
  branch: z.ZodOptional<z.ZodString>;
  depth: z.ZodOptional<z.ZodNumber>;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
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

export type GitCloneInput = z.infer<typeof GitCloneInputSchema>;

export interface GitCloneOutput {
  path: string;
  branch: string;
}

// =============================================================================
// git.checkout Types - Checkout branch or files
// =============================================================================

export const GitCheckoutInputSchema: z.ZodObject<{
  ref: z.ZodString;
  create: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
  paths: z.ZodOptional<z.ZodArray<z.ZodString>>;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Branch, tag, or commit to checkout */
  ref: z.string(),
  /** Create branch if it doesn't exist (default: false) */
  create: z.boolean().optional().default(false),
  /** Specific paths to checkout (default: all) */
  paths: z.array(z.string()).optional(),
  /** Working directory */
  cwd: z.string().optional(),
});

export type GitCheckoutInput = z.infer<typeof GitCheckoutInputSchema>;

export interface GitCheckoutOutput {
  ref: string;
  created: boolean;
}

// =============================================================================
// git.branch Types - Branch operations
// =============================================================================

export const GitBranchInputSchema: z.ZodObject<{
  name: z.ZodOptional<z.ZodString>;
  delete: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
  list: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
  remote: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
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

export type GitBranchInput = z.infer<typeof GitBranchInputSchema>;

export interface GitBranchInfo {
  name: string;
  current: boolean;
  remote: boolean;
  tracking?: string;
}

export interface GitBranchOutput {
  branches?: GitBranchInfo[];
  created?: string;
  deleted?: string;
  current: string;
}

// =============================================================================
// git.log Types - Show commit log
// =============================================================================

export const GitLogInputSchema: z.ZodObject<{
  count: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
  oneline: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
  ref: z.ZodOptional<z.ZodString>;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Number of commits to show (default: 10) */
  count: z.number().optional().default(10),
  /** One line per commit (default: false) */
  oneline: z.boolean().optional().default(false),
  /** Branch/tag/commit to start from (default: HEAD) */
  ref: z.string().optional(),
  /** Working directory */
  cwd: z.string().optional(),
});

export type GitLogInput = z.infer<typeof GitLogInputSchema>;

export interface GitLogCommit {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  date: string;
  message: string;
}

export interface GitLogOutput {
  commits: GitLogCommit[];
}

// =============================================================================
// git.diff Types - Show changes
// =============================================================================

export const GitDiffInputSchema: z.ZodObject<{
  staged: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
  ref: z.ZodOptional<z.ZodString>;
  paths: z.ZodOptional<z.ZodArray<z.ZodString>>;
  stat: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
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

export type GitDiffInput = z.infer<typeof GitDiffInputSchema>;

export interface GitDiffFile {
  path: string;
  additions: number;
  deletions: number;
}

export interface GitDiffOutput {
  files: GitDiffFile[];
  additions: number;
  deletions: number;
  diff?: string;
}

// =============================================================================
// git.init Types - Initialize a git repository
// =============================================================================

export const GitInitInputSchema: z.ZodObject<{
  cwd: z.ZodOptional<z.ZodString>;
  bare: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
  initialBranch: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Directory to initialize (default: process.cwd()) */
  cwd: z.string().optional(),
  /** Create a bare repository (default: false) */
  bare: z.boolean().optional().default(false),
  /** Name for the initial branch */
  initialBranch: z.string().optional(),
});

export type GitInitInput = z.infer<typeof GitInitInputSchema>;

export interface GitInitOutput {
  /** The initialized repository path */
  path: string;
  /** Whether the repo was newly created */
  created: boolean;
}

// =============================================================================
// git.remote Types - Get or set remote URLs
// =============================================================================

export const GitRemoteInputSchema: z.ZodObject<{
  name: z.ZodDefault<z.ZodOptional<z.ZodString>>;
  url: z.ZodOptional<z.ZodString>;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Remote name (default: origin) */
  name: z.string().optional().default("origin"),
  /** New URL to set (if provided, sets the URL; otherwise gets it) */
  url: z.string().optional(),
  /** Working directory */
  cwd: z.string().optional(),
});

export type GitRemoteInput = z.infer<typeof GitRemoteInputSchema>;

export interface GitRemoteOutput {
  /** Remote name */
  name: string;
  /** Remote URL */
  url: string;
}

// =============================================================================
// git.fetch Types - Fetch from remote
// =============================================================================

export const GitFetchInputSchema: z.ZodObject<{
  remote: z.ZodDefault<z.ZodOptional<z.ZodString>>;
  branch: z.ZodOptional<z.ZodString>;
  all: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
  prune: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
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

export type GitFetchInput = z.infer<typeof GitFetchInputSchema>;

export interface GitFetchOutput {
  remote: string;
  fetched: boolean;
}

// =============================================================================
// git.* Predicate Types
// =============================================================================

export const GitPredicateInputSchema: z.ZodObject<{
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Working directory (default: process.cwd()) */
  cwd: z.string().optional(),
});

export type GitPredicateInput = {
  /** Working directory (default: process.cwd()) */
  cwd?: string | undefined;
};

export interface GitPredicateOutput {
  /** The predicate result */
  value: boolean;
}

// =============================================================================
// git.stash.* Types - Stash operations
// =============================================================================

export interface GitStashEntry {
  /** Stash index (0 = most recent) */
  index: number;
  /** Stash reference (e.g., stash@{0}) */
  ref: string;
  /** Commit hash of the stash */
  hash: string;
  /** Stash message */
  message: string;
}

// git.stash.list
export const GitStashListInputSchema: z.ZodObject<{
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Working directory (default: process.cwd()) */
  cwd: z.string().optional(),
});

export type GitStashListInput = z.infer<typeof GitStashListInputSchema>;

export interface GitStashListOutput {
  /** List of stashes */
  stashes: GitStashEntry[];
  /** Total count */
  count: number;
}

// git.stash.push
export const GitStashPushInputSchema: z.ZodObject<{
  message: z.ZodOptional<z.ZodString>;
  includeUntracked: z.ZodOptional<z.ZodBoolean>;
  keepIndex: z.ZodOptional<z.ZodBoolean>;
  paths: z.ZodOptional<z.ZodArray<z.ZodString>>;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Stash message */
  message: z.string().optional(),
  /** Include untracked files (default: false) */
  includeUntracked: z.boolean().optional(),
  /** Keep staged changes in index (default: false) */
  keepIndex: z.boolean().optional(),
  /** Specific paths to stash */
  paths: z.array(z.string()).optional(),
  /** Working directory */
  cwd: z.string().optional(),
});

export type GitStashPushInput = z.infer<typeof GitStashPushInputSchema>;

export interface GitStashPushOutput {
  /** Whether changes were stashed */
  stashed: boolean;
  /** Stash reference if created */
  ref?: string | undefined;
  /** Stash message */
  message?: string | undefined;
}

// git.stash.pop
export const GitStashPopInputSchema: z.ZodObject<{
  index: z.ZodOptional<z.ZodNumber>;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Stash index to pop (default: 0 = most recent) */
  index: z.number().optional(),
  /** Working directory */
  cwd: z.string().optional(),
});

export type GitStashPopInput = z.infer<typeof GitStashPopInputSchema>;

export interface GitStashPopOutput {
  /** Whether stash was applied */
  applied: boolean;
  /** Stash reference that was popped */
  ref: string;
  /** Whether stash was dropped (false if conflict) */
  dropped: boolean;
  /** Whether there was a merge conflict */
  conflict?: boolean | undefined;
}

// git.stash.apply
export const GitStashApplyInputSchema: z.ZodObject<{
  index: z.ZodOptional<z.ZodNumber>;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Stash index to apply (default: 0 = most recent) */
  index: z.number().optional(),
  /** Working directory */
  cwd: z.string().optional(),
});

export type GitStashApplyInput = z.infer<typeof GitStashApplyInputSchema>;

export interface GitStashApplyOutput {
  /** Whether stash was applied */
  applied: boolean;
  /** Stash reference that was applied */
  ref: string;
  /** Whether there was a merge conflict */
  conflict?: boolean | undefined;
}

// git.stash.drop
export const GitStashDropInputSchema: z.ZodObject<{
  index: z.ZodOptional<z.ZodNumber>;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Stash index to drop (default: 0 = most recent) */
  index: z.number().optional(),
  /** Working directory */
  cwd: z.string().optional(),
});

export type GitStashDropInput = z.infer<typeof GitStashDropInputSchema>;

export interface GitStashDropOutput {
  /** Whether stash was dropped */
  dropped: boolean;
  /** Stash reference that was dropped */
  ref: string;
}

// git.stash.export - Export stash as patch for snapshot storage
export const GitStashExportInputSchema: z.ZodObject<{
  index: z.ZodOptional<z.ZodNumber>;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Stash index to export (default: 0 = most recent) */
  index: z.number().optional(),
  /** Working directory */
  cwd: z.string().optional(),
});

export type GitStashExportInput = z.infer<typeof GitStashExportInputSchema>;

export interface GitStashExportOutput {
  /** Stash reference */
  ref: string;
  /** Commit hash */
  hash: string;
  /** Stash message */
  message: string;
  /** Patch content (diff) */
  patch: string;
  /** Whether stash includes untracked files */
  hasUntracked: boolean;
  /** Untracked files patch if present */
  untrackedPatch?: string | undefined;
}

// git.stash.import - Import stash from patch
export const GitStashImportInputSchema: z.ZodObject<{
  patch: z.ZodString;
  message: z.ZodOptional<z.ZodString>;
  includeUntracked: z.ZodOptional<z.ZodBoolean>;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Patch content to apply and stash */
  patch: z.string(),
  /** Message for the new stash */
  message: z.string().optional(),
  /** Include untracked files (default: false) */
  includeUntracked: z.boolean().optional(),
  /** Working directory */
  cwd: z.string().optional(),
});

export type GitStashImportInput = z.infer<typeof GitStashImportInputSchema>;

export interface GitStashImportOutput {
  /** Whether import succeeded */
  imported: boolean;
  /** New stash reference if created */
  ref?: string | undefined;
  /** Error message if failed */
  error?: string | undefined;
}
