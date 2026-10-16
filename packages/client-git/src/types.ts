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
  cwd: z.string().optional().describe("Working directory (default: process.cwd())"),
  /** Show short format (default: false) */
  short: z.boolean().optional().default(false).describe("Show short format (default: false)"),
});

export type GitStatusInput = z.infer<typeof GitStatusInputSchema>;

export interface GitStatusFile {
  /** The path of the file (for a rename or a copy, the new path) */
  path: string;
  /** For a rename or a copy, the old path */
  from?: string | undefined;
  status: "modified" | "added" | "deleted" | "renamed" | "copied" | "untracked" | "ignored";
  staged: boolean;
}

export interface GitStatusOutput {
  branch: string;
  ahead: number;
  behind: number;
  files: GitStatusFile[];
  clean: boolean;
  /** With `short: true`, one line per file in the format of `git status --short` */
  lines?: string[] | undefined;
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
  paths: z.array(z.string()).optional().default([]).describe("Paths to stage (default: [])"),
  /** Stage all changes (default: false) */
  all: z.boolean().optional().default(false).describe("Stage all changes (default: false)"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
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
  message: z.string().describe("Commit message"),
  /** Automatically stage modified files (default: false) */
  all: z.boolean().optional().default(false).describe("Automatically stage modified files (default: false)"),
  /** Amend the last commit (default: false) */
  amend: z.boolean().optional().default(false).describe("Amend the last commit (default: false)"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
});

export type GitCommitInput = z.infer<typeof GitCommitInputSchema>;

export interface GitCommitOutput {
  hash: string;
  message: string;
  author: string;
  date: string;
  /** True if commit was skipped (nothing to commit) */
  skipped?: boolean | undefined;
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
  remote: z.string().optional().default("origin").describe("Remote name (default: origin)"),
  /** Branch to push (default: current branch) */
  branch: z.string().optional().describe("Branch to push (default: current branch)"),
  /** Force push (default: false) */
  force: z.boolean().optional().default(false).describe("Force push (default: false)"),
  /** Set upstream tracking (default: false) */
  setUpstream: z.boolean().optional().default(false).describe("Set upstream tracking (default: false)"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
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
  remote: z.string().optional().default("origin").describe("Remote name (default: origin)"),
  /** Branch to pull (default: current branch) */
  branch: z.string().optional().describe("Branch to pull (default: current branch)"),
  /** Rebase instead of merge (default: false) */
  rebase: z.boolean().optional().default(false).describe("Rebase instead of merge (default: false)"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
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
  url: z.string().describe("Repository URL"),
  /** Destination directory (default: derived from URL) */
  dest: z.string().optional().describe("Destination directory (default: derived from URL)"),
  /** Branch to clone (default: default branch) */
  branch: z.string().optional().describe("Branch to clone (default: default branch)"),
  /** Create shallow clone with depth (default: full clone) */
  depth: z.number().optional().describe("Create shallow clone with depth (default: full clone)"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
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
  ref: z.string().describe("Branch, tag, or commit to checkout"),
  /** Create branch if it doesn't exist (default: false) */
  create: z.boolean().optional().default(false).describe("Create branch if it doesn't exist (default: false)"),
  /** Specific paths to checkout (default: all) */
  paths: z.array(z.string()).optional().describe("Specific paths to checkout (default: all)"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
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
  name: z.string().optional().describe("Branch name (for create/delete)"),
  /** Delete the branch (default: false) */
  delete: z.boolean().optional().default(false).describe("Delete the branch (default: false)"),
  /** List branches (default: true if no name provided) */
  list: z.boolean().optional().default(false).describe("List branches (default: true if no name provided)"),
  /** Include remote branches in list (default: false) */
  remote: z.boolean().optional().default(false).describe("Include remote branches in list (default: false)"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
});

export type GitBranchInput = z.infer<typeof GitBranchInputSchema>;

export interface GitBranchInfo {
  name: string;
  current: boolean;
  remote: boolean;
  tracking?: string | undefined;
}

export interface GitBranchOutput {
  branches?: GitBranchInfo[] | undefined;
  created?: string | undefined;
  deleted?: string | undefined;
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
  count: z.number().optional().default(10).describe("Number of commits to show (default: 10)"),
  /** One line per commit (default: false) */
  oneline: z.boolean().optional().default(false).describe("One line per commit (default: false)"),
  /** Branch/tag/commit to start from (default: HEAD) */
  ref: z.string().optional().describe("Branch/tag/commit to start from (default: HEAD)"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
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
  /** With `oneline: true`, one line per commit: the short hash and the subject */
  lines?: string[] | undefined;
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
  staged: z.boolean().optional().default(false).describe("Show staged changes (default: false, shows unstaged)"),
  /** Compare against ref (branch/commit) */
  ref: z.string().optional().describe("Compare against ref (branch/commit)"),
  /** Specific paths to diff */
  paths: z.array(z.string()).optional().describe("Specific paths to diff"),
  /** Show stat summary only (default: false) */
  stat: z.boolean().optional().default(false).describe("Show stat summary only (default: false)"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
});

export type GitDiffInput = z.infer<typeof GitDiffInputSchema>;

export interface GitDiffFile {
  /** The path of the file (for a rename, the new path) */
  path: string;
  /** For a rename, the old path */
  from?: string | undefined;
  /** Added lines (0 for a binary file) */
  additions: number;
  /** Deleted lines (0 for a binary file) */
  deletions: number;
}

export interface GitDiffOutput {
  files: GitDiffFile[];
  additions: number;
  deletions: number;
  diff?: string | undefined;
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
  cwd: z.string().optional().describe("Directory to initialize (default: process.cwd())"),
  /** Create a bare repository (default: false) */
  bare: z.boolean().optional().default(false).describe("Create a bare repository (default: false)"),
  /** Name for the initial branch */
  initialBranch: z.string().optional().describe("Name for the initial branch"),
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
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Remote name (default: origin) */
  name: z.string().optional().default("origin").describe("Remote name (default: origin)"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
});

export type GitRemoteInput = z.infer<typeof GitRemoteInputSchema>;

/**
 * The input of git.remote.set. Before 0.2.0, `git.remote` with `url` set the URL: one procedure
 * read and wrote, so a reader of the URL had to declare that it writes (CAPABILITIES-2026-10).
 */
export const GitRemoteSetInputSchema: z.ZodObject<{
  name: z.ZodDefault<z.ZodOptional<z.ZodString>>;
  url: z.ZodString;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Remote name (default: origin) */
  name: z.string().optional().default("origin").describe("Remote name (default: origin)"),
  /** The URL of the remote: it replaces the URL, or adds the remote when it is missing */
  url: z.string().describe("The URL of the remote: it replaces the URL, or adds the remote when it is missing"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
});

export type GitRemoteSetInput = z.infer<typeof GitRemoteSetInputSchema>;

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
  remote: z.string().optional().default("origin").describe("Remote name (default: origin)"),
  /** Specific branch to fetch (default: all) */
  branch: z.string().optional().describe("Specific branch to fetch (default: all)"),
  /** Fetch all remotes (default: false) */
  all: z.boolean().optional().default(false).describe("Fetch all remotes (default: false)"),
  /** Prune deleted branches (default: false) */
  prune: z.boolean().optional().default(false).describe("Prune deleted branches (default: false)"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
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
  cwd: z.string().optional().describe("Working directory (default: process.cwd())"),
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
  cwd: z.string().optional().describe("Working directory (default: process.cwd())"),
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
  message: z.string().optional().describe("Stash message"),
  /** Include untracked files (default: false) */
  includeUntracked: z.boolean().optional().describe("Include untracked files (default: false)"),
  /** Keep staged changes in index (default: false) */
  keepIndex: z.boolean().optional().describe("Keep staged changes in index (default: false)"),
  /** Specific paths to stash */
  paths: z.array(z.string()).optional().describe("Specific paths to stash"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
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
  index: z.number().optional().describe("Stash index to pop (default: 0 = most recent)"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
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
  index: z.number().optional().describe("Stash index to apply (default: 0 = most recent)"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
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
  index: z.number().optional().describe("Stash index to drop (default: 0 = most recent)"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
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
  index: z.number().optional().describe("Stash index to export (default: 0 = most recent)"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
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
  patch: z.string().describe("Patch content to apply and stash"),
  /** Message for the new stash */
  message: z.string().optional().describe("Message for the new stash"),
  /** Include untracked files (default: false) */
  includeUntracked: z.boolean().optional().describe("Include untracked files (default: false)"),
  /** Working directory */
  cwd: z.string().optional().describe("Working directory"),
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

// =============================================================================
// Output schemas (roadmap 2.1)
// =============================================================================

// Loose objects: a field that a schema does not name stays in the result (a strict schema would
// remove it when the output is validated).

const statusFile = z.looseObject({
  path: z.string().describe("The path of the file (for a rename or a copy, the new path)"),
  from: z.string().optional().describe("For a rename or a copy, the old path"),
  status: z
    .enum(["modified", "added", "deleted", "renamed", "copied", "untracked", "ignored"])
    .describe("The change of the file"),
  staged: z.boolean().describe("True when the change is in the index"),
});

export const GitStatusOutputSchema: z.ZodType<GitStatusOutput> = z.looseObject({
  branch: z.string().describe('The current branch ("HEAD" when detached)'),
  ahead: z.number().describe("The commits that the upstream does not have"),
  behind: z.number().describe("The commits of the upstream that the branch does not have"),
  files: z.array(statusFile).describe("The changed, untracked and ignored files"),
  clean: z.boolean().describe("True when nothing changed"),
  lines: z.array(z.string()).optional().describe("With short: true, one line per file as git status --short gives it"),
});

export const GitAddOutputSchema: z.ZodType<GitAddOutput> = z.looseObject({
  staged: z.array(z.string()).describe("The files that the call staged"),
});

export const GitCommitOutputSchema: z.ZodType<GitCommitOutput> = z.looseObject({
  hash: z.string().describe("The hash of the new commit"),
  message: z.string().describe("The commit message"),
  author: z.string().describe("The author"),
  date: z.string().describe("The date of the commit"),
  skipped: z.boolean().optional().describe("True when there was nothing to commit"),
});

export const GitPushOutputSchema: z.ZodType<GitPushOutput> = z.looseObject({
  remote: z.string().describe("The remote"),
  branch: z.string().describe("The branch"),
  commits: z.number().describe("The number of commits that the push sent"),
});

export const GitPullOutputSchema: z.ZodType<GitPullOutput> = z.looseObject({
  remote: z.string().describe("The remote"),
  branch: z.string().describe("The branch"),
  commits: z.number().describe("The number of commits that the pull brought"),
  fastForward: z.boolean().describe("True for a fast-forward"),
});

export const GitCloneOutputSchema: z.ZodType<GitCloneOutput> = z.looseObject({
  path: z.string().describe("The folder of the clone"),
  branch: z.string().describe("The branch of the clone"),
});

export const GitCheckoutOutputSchema: z.ZodType<GitCheckoutOutput> = z.looseObject({
  ref: z.string().describe("The branch or the ref that is checked out"),
  created: z.boolean().describe("True when the call made the branch"),
});

export const GitBranchOutputSchema: z.ZodType<GitBranchOutput> = z.looseObject({
  branches: z
    .array(
      z.looseObject({
        name: z.string().describe("The branch name"),
        current: z.boolean().describe("True for the current branch"),
        remote: z.boolean().describe("True for a remote-tracking branch"),
        tracking: z.string().optional().describe("The upstream of the branch"),
      })
    )
    .optional()
    .describe("The branches, for a list"),
  created: z.string().optional().describe("The branch that the call made"),
  deleted: z.string().optional().describe("The branch that the call deleted"),
  current: z.string().describe("The current branch"),
});

export const GitLogOutputSchema: z.ZodType<GitLogOutput> = z.looseObject({
  commits: z
    .array(
      z.looseObject({
        hash: z.string().describe("The commit hash"),
        shortHash: z.string().describe("The short hash"),
        author: z.string().describe("The author name"),
        email: z.string().describe("The author email"),
        date: z.string().describe("The author date"),
        message: z.string().describe("The commit message"),
      })
    )
    .describe("The commits, newest first"),
  lines: z.array(z.string()).optional().describe("With oneline: true, the short hash and the subject of each commit"),
});

export const GitDiffOutputSchema: z.ZodType<GitDiffOutput> = z.looseObject({
  files: z
    .array(
      z.looseObject({
        path: z.string().describe("The path of the file (for a rename, the new path)"),
        from: z.string().optional().describe("For a rename, the old path"),
        additions: z.number().describe("The added lines (0 for a binary file)"),
        deletions: z.number().describe("The deleted lines (0 for a binary file)"),
      })
    )
    .describe("The changed files"),
  additions: z.number().describe("The added lines of all files"),
  deletions: z.number().describe("The deleted lines of all files"),
  diff: z.string().optional().describe("The text of the diff"),
});

export const GitInitOutputSchema: z.ZodType<GitInitOutput> = z.looseObject({
  path: z.string().describe("The folder of the repository"),
  created: z.boolean().describe("True when the call made a new repository"),
});

export const GitRemoteOutputSchema: z.ZodType<GitRemoteOutput> = z.looseObject({
  name: z.string().describe("The remote name"),
  url: z.string().describe("The remote URL"),
});

export const GitFetchOutputSchema: z.ZodType<GitFetchOutput> = z.looseObject({
  remote: z.string().describe("The remote"),
  fetched: z.boolean().describe("True when the fetch ran"),
});

export const GitPredicateOutputSchema: z.ZodType<GitPredicateOutput> = z.looseObject({
  value: z.boolean().describe("The answer of the predicate"),
});

export const GitStashListOutputSchema: z.ZodType<GitStashListOutput> = z.looseObject({
  stashes: z
    .array(
      z.looseObject({
        index: z.number().describe("The stash index (0 is the newest)"),
        ref: z.string().describe("The stash reference, for example stash@{0}"),
        hash: z.string().describe("The commit hash of the stash"),
        message: z.string().describe("The stash message"),
      })
    )
    .describe("The stashes"),
  count: z.number().describe("The number of stashes"),
});

export const GitStashPushOutputSchema: z.ZodType<GitStashPushOutput> = z.looseObject({
  stashed: z.boolean().describe("True when the call stashed changes"),
  ref: z.string().optional().describe("The new stash reference"),
  message: z.string().optional().describe("The stash message"),
});

export const GitStashPopOutputSchema: z.ZodType<GitStashPopOutput> = z.looseObject({
  applied: z.boolean().describe("True when the stash was applied"),
  ref: z.string().describe("The stash reference"),
  dropped: z.boolean().describe("True when the stash was dropped (false after a conflict)"),
  conflict: z.boolean().optional().describe("True when the stash had a merge conflict"),
});

export const GitStashApplyOutputSchema: z.ZodType<GitStashApplyOutput> = z.looseObject({
  applied: z.boolean().describe("True when the stash was applied"),
  ref: z.string().describe("The stash reference"),
  conflict: z.boolean().optional().describe("True when the stash had a merge conflict"),
});

export const GitStashDropOutputSchema: z.ZodType<GitStashDropOutput> = z.looseObject({
  dropped: z.boolean().describe("True when the stash was dropped"),
  ref: z.string().describe("The stash reference"),
});

export const GitStashExportOutputSchema: z.ZodType<GitStashExportOutput> = z.looseObject({
  ref: z.string().describe("The stash reference"),
  hash: z.string().describe("The commit hash of the stash"),
  message: z.string().describe("The stash message"),
  patch: z.string().describe("The patch of the tracked changes"),
  hasUntracked: z.boolean().describe("True when the stash has untracked files"),
  untrackedPatch: z.string().optional().describe("The patch of the untracked files"),
});

export const GitStashImportOutputSchema: z.ZodType<GitStashImportOutput> = z.looseObject({
  imported: z.boolean().describe("True when the import succeeded"),
  ref: z.string().optional().describe("The new stash reference"),
  error: z.string().optional().describe("Why the import failed"),
});
