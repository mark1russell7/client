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
  paths: z.ZodOptional<z.ZodArray<z.ZodString>>;
  untrackedFiles: z.ZodOptional<z.ZodEnum<{ no: "no"; normal: "normal"; all: "all" }>>;
}> = z.object({
  /** Working directory (default: process.cwd()) */
  cwd: z.string().optional().describe("Working directory (default: process.cwd())"),
  /** Show short format (default: false) */
  short: z.boolean().optional().default(false).describe("Show short format (default: false)"),
  /** Only the files of these pathspecs (git status -- <paths>) */
  paths: z.array(z.string().min(1)).optional().describe("Only the files of these pathspecs (git status -- <paths>)"),
  /** The untracked files: none ("no"), new folders as one entry ("normal", the default of git), or each file ("all") */
  untrackedFiles: z
    .enum(["no", "normal", "all"])
    .optional()
    .describe('The untracked files (--untracked-files): "no", "normal" (a new folder is one entry) or "all" (each file)'),
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
  paths: z.ZodOptional<z.ZodArray<z.ZodString>>;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  /** Commit message */
  message: z.string().describe("Commit message"),
  /** Automatically stage modified files (default: false) */
  all: z.boolean().optional().default(false).describe("Automatically stage modified files (default: false)"),
  /** Amend the last commit (default: false) */
  amend: z.boolean().optional().default(false).describe("Amend the last commit (default: false)"),
  /**
   * Commit only these pathspecs, as they are in the working tree (git commit -- <paths>). Other
   * staged changes stay in the index. A file must be tracked: add a new file first.
   */
  paths: z
    .array(z.string().min(1))
    .optional()
    .describe("Commit only these pathspecs, as they are in the working tree (git commit -- <paths>). Other staged changes stay staged"),
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

// =============================================================================
// git.show Types - Show a commit, or a file at a commit (roadmap R40)
// =============================================================================

export const GitShowInputSchema: z.ZodObject<{
  ref: z.ZodOptional<z.ZodString>;
  path: z.ZodOptional<z.ZodString>;
  stat: z.ZodOptional<z.ZodBoolean>;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  ref: z.string().optional().describe("The commit, branch or tag (default: HEAD)"),
  path: z.string().optional().describe("A file, relative to the root of the repository: the call gives its content at the commit"),
  stat: z.boolean().optional().describe("Give the counts of the files, without the text of the diff (default: false)"),
  cwd: z.string().optional().describe("Working directory"),
});

export type GitShowInput = z.infer<typeof GitShowInputSchema>;

export interface GitShowOutput {
  /** The ref of the input */
  ref: string;
  /** The hash of the commit */
  hash: string;
  /** Without `path`: the short hash */
  shortHash?: string | undefined;
  /** Without `path`: the author name */
  author?: string | undefined;
  /** Without `path`: the author email */
  email?: string | undefined;
  /** Without `path`: the author date */
  date?: string | undefined;
  /** Without `path`: the subject of the commit message */
  message?: string | undefined;
  /** Without `path`: the commit message after the subject */
  body?: string | undefined;
  /** Without `path`: the changed files, against the first parent */
  files?: GitDiffFile[] | undefined;
  additions?: number | undefined;
  deletions?: number | undefined;
  /** Without `path` and `stat`: the text of the diff */
  diff?: string | undefined;
  /** With `path`: the file */
  path?: string | undefined;
  /** With `path`: the content of the file at the commit */
  content?: string | undefined;
}

// =============================================================================
// git.blame Types - The commit and the author of each line of a file (roadmap R40)
// =============================================================================

export const GitBlameInputSchema: z.ZodObject<{
  path: z.ZodString;
  ref: z.ZodOptional<z.ZodString>;
  startLine: z.ZodOptional<z.ZodNumber>;
  endLine: z.ZodOptional<z.ZodNumber>;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  path: z.string().describe("The file"),
  ref: z.string().optional().describe("The commit (default: the working tree)"),
  startLine: z.number().int().positive().optional().describe("The first line (default: 1)"),
  endLine: z.number().int().positive().optional().describe("The last line (default: the last line of the file)"),
  cwd: z.string().optional().describe("Working directory"),
});

export type GitBlameInput = z.infer<typeof GitBlameInputSchema>;

export interface GitBlameLine {
  /** The line number in the file (1 is the first line) */
  line: number;
  /** The commit that last changed the line (zeros for a change that is not committed) */
  hash: string;
  author: string;
  email: string;
  /** The author date, as an ISO 8601 string */
  date: string;
  /** The subject of the commit */
  summary: string;
  /** The text of the line */
  content: string;
}

export interface GitBlameOutput {
  path: string;
  lines: GitBlameLine[];
}

// =============================================================================
// git.tag.* Types - Tags (roadmap R40)
// =============================================================================

export const GitTagListInputSchema: z.ZodObject<{
  pattern: z.ZodOptional<z.ZodString>;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  pattern: z.string().optional().describe("A glob pattern for the tag names, for example v1.*"),
  cwd: z.string().optional().describe("Working directory"),
});

export type GitTagListInput = z.infer<typeof GitTagListInputSchema>;

export interface GitTagInfo {
  name: string;
  /** The commit of the tag */
  hash: string;
  /** True for an annotated tag */
  annotated: boolean;
  /** For an annotated tag: the subject of its message */
  message?: string | undefined;
}

export interface GitTagListOutput {
  tags: GitTagInfo[];
}

export const GitTagAddInputSchema: z.ZodObject<{
  name: z.ZodString;
  ref: z.ZodOptional<z.ZodString>;
  message: z.ZodOptional<z.ZodString>;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  name: z.string().describe("The tag name"),
  ref: z.string().optional().describe("The commit of the tag (default: HEAD)"),
  message: z.string().optional().describe("The message: with it, the tag is an annotated tag"),
  cwd: z.string().optional().describe("Working directory"),
});

export type GitTagAddInput = z.infer<typeof GitTagAddInputSchema>;

export interface GitTagAddOutput {
  name: string;
  /** The commit of the tag */
  hash: string;
  annotated: boolean;
}

export const GitTagDeleteInputSchema: z.ZodObject<{
  name: z.ZodString;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  name: z.string().describe("The tag name"),
  cwd: z.string().optional().describe("Working directory"),
});

export type GitTagDeleteInput = z.infer<typeof GitTagDeleteInputSchema>;

export interface GitTagDeleteOutput {
  name: string;
  /** The object of the deleted tag: a tag object or a commit */
  hash: string;
}

// =============================================================================
// git.revParse Types - The hash or the name of a ref (roadmap R40)
// =============================================================================

export const GitRevParseInputSchema: z.ZodObject<{
  ref: z.ZodOptional<z.ZodString>;
  abbrevRef: z.ZodOptional<z.ZodBoolean>;
  short: z.ZodOptional<z.ZodBoolean>;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  ref: z.string().optional().describe("The ref, for example HEAD, main, v1.0 or HEAD~2 (default: HEAD)"),
  abbrevRef: z.boolean().optional().describe("Give the short name of the ref, for example main for HEAD (default: false)"),
  short: z.boolean().optional().describe("Give the short hash (default: false)"),
  cwd: z.string().optional().describe("Working directory"),
});

export type GitRevParseInput = z.infer<typeof GitRevParseInputSchema>;

export interface GitRevParseOutput {
  ref: string;
  /** The hash, the short hash or the short name */
  value: string;
}

// =============================================================================
// git.reset Types - Move HEAD, and reset the index or the working tree (roadmap R40)
// =============================================================================

export const GitResetInputSchema: z.ZodObject<{
  ref: z.ZodOptional<z.ZodString>;
  mode: z.ZodOptional<z.ZodEnum<{ soft: "soft"; mixed: "mixed"; hard: "hard"; merge: "merge"; keep: "keep" }>>;
  paths: z.ZodOptional<z.ZodArray<z.ZodString>>;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  ref: z.string().optional().describe("The commit (default: HEAD)"),
  mode: z
    .enum(["soft", "mixed", "hard", "merge", "keep"])
    .optional()
    .describe("soft keeps the index, mixed resets the index, hard also resets the working tree (default: mixed)"),
  paths: z.array(z.string()).optional().describe("Reset only these paths in the index. HEAD does not move. Only the mode mixed accepts paths"),
  cwd: z.string().optional().describe("Working directory"),
});

export type GitResetInput = z.infer<typeof GitResetInputSchema>;

export interface GitResetOutput {
  ref: string;
  mode: "soft" | "mixed" | "hard" | "merge" | "keep";
  /** HEAD after the reset */
  hash: string;
}

// =============================================================================
// git.restore Types - Restore files of the working tree or the index (roadmap R40)
// =============================================================================

export const GitRestoreInputSchema: z.ZodObject<{
  paths: z.ZodArray<z.ZodString>;
  source: z.ZodOptional<z.ZodString>;
  staged: z.ZodOptional<z.ZodBoolean>;
  worktree: z.ZodOptional<z.ZodBoolean>;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  paths: z.array(z.string()).min(1).describe("The paths to restore"),
  source: z.string().optional().describe("The commit to restore from (default: the index for the working tree, HEAD for the index)"),
  staged: z.boolean().optional().describe("Restore the index: this unstages the changes (default: false)"),
  worktree: z.boolean().optional().describe("Restore the working tree (default: true without staged, false with staged)"),
  cwd: z.string().optional().describe("Working directory"),
});

export type GitRestoreInput = z.infer<typeof GitRestoreInputSchema>;

export interface GitRestoreOutput {
  /** The paths of the input */
  restored: string[];
}

// =============================================================================
// git.merge Types - Merge into the current branch (roadmap R40)
// =============================================================================

export const GitMergeInputSchema: z.ZodObject<{
  ref: z.ZodString;
  fastForward: z.ZodOptional<z.ZodEnum<{ auto: "auto"; only: "only"; never: "never" }>>;
  message: z.ZodOptional<z.ZodString>;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  ref: z.string().describe("The branch or the commit to merge"),
  fastForward: z
    .enum(["auto", "only", "never"])
    .optional()
    .describe("auto: a fast-forward when possible. only: fail without a fast-forward. never: always a merge commit (default: auto)"),
  message: z.string().optional().describe("The message of the merge commit (default: the message of git)"),
  cwd: z.string().optional().describe("Working directory"),
});

export type GitMergeInput = z.infer<typeof GitMergeInputSchema>;

export interface GitMergeOutput {
  ref: string;
  /** HEAD after the call */
  hash: string;
  /** True when the branch moved to the ref without a merge commit */
  fastForward: boolean;
  /** True when the branch has the ref already: nothing changed */
  upToDate: boolean;
  /** True when the merge stopped on conflicts: resolve them and commit, or call git.merge.abort */
  conflict: boolean;
  /** The files with conflicts */
  conflicts?: string[] | undefined;
}

export const GitMergeAbortInputSchema: z.ZodObject<{
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  cwd: z.string().optional().describe("Working directory"),
});

export type GitMergeAbortInput = z.infer<typeof GitMergeAbortInputSchema>;

export interface GitMergeAbortOutput {
  aborted: boolean;
  /** HEAD after the call */
  hash: string;
}

// =============================================================================
// git.rebase.* Types - A rebase that is not interactive (roadmap R40)
// =============================================================================

export const GitRebaseInputSchema: z.ZodObject<{
  upstream: z.ZodString;
  onto: z.ZodOptional<z.ZodString>;
  branch: z.ZodOptional<z.ZodString>;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  upstream: z.string().describe("The branch or the commit to rebase on"),
  onto: z.string().optional().describe("The new base of the commits, when it is not the upstream"),
  branch: z.string().optional().describe("The branch to rebase. Git checks it out first (default: the current branch)"),
  cwd: z.string().optional().describe("Working directory"),
});

export type GitRebaseInput = z.infer<typeof GitRebaseInputSchema>;

export interface GitRebaseOutput {
  /** HEAD after the call */
  hash: string;
  /** True when the rebase is complete */
  completed: boolean;
  /** True when the branch had nothing to rebase: nothing changed */
  upToDate: boolean;
  /** True when the rebase stopped on conflicts: resolve them, then call git.rebase.continue or git.rebase.abort */
  conflict: boolean;
  /** The files with conflicts */
  conflicts?: string[] | undefined;
}

export const GitRebaseContinueInputSchema: z.ZodObject<{
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  cwd: z.string().optional().describe("Working directory"),
});

export type GitRebaseContinueInput = z.infer<typeof GitRebaseContinueInputSchema>;

/** git.rebase.continue gives the result of git.rebase. */
export type GitRebaseContinueOutput = GitRebaseOutput;

export const GitRebaseAbortInputSchema: z.ZodObject<{
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  cwd: z.string().optional().describe("Working directory"),
});

export type GitRebaseAbortInput = z.infer<typeof GitRebaseAbortInputSchema>;

export interface GitRebaseAbortOutput {
  aborted: boolean;
  /** HEAD after the call: the branch as it was before the rebase */
  hash: string;
}

// =============================================================================
// git.worktree.* Types - Working trees (roadmap R40)
// =============================================================================

export const GitWorktreeListInputSchema: z.ZodObject<{
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  cwd: z.string().optional().describe("Working directory"),
});

export type GitWorktreeListInput = z.infer<typeof GitWorktreeListInputSchema>;

export interface GitWorktreeInfo {
  /** The absolute path of the working tree */
  path: string;
  /** The commit that is checked out */
  head?: string | undefined;
  /** The branch that is checked out */
  branch?: string | undefined;
  detached: boolean;
  bare: boolean;
  locked: boolean;
  /** True when the folder of the working tree is gone */
  prunable: boolean;
}

export interface GitWorktreeListOutput {
  worktrees: GitWorktreeInfo[];
}

export const GitWorktreeAddInputSchema: z.ZodObject<{
  path: z.ZodString;
  ref: z.ZodOptional<z.ZodString>;
  branch: z.ZodOptional<z.ZodString>;
  detach: z.ZodOptional<z.ZodBoolean>;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  path: z.string().describe("The folder of the new working tree. It must not exist, or it must be empty"),
  ref: z.string().optional().describe("The branch or the commit to check out (default: HEAD)"),
  branch: z.string().optional().describe("Make this new branch at the ref, and check it out"),
  detach: z.boolean().optional().describe("Check out the commit of the ref without a branch (default: false)"),
  cwd: z.string().optional().describe("Working directory"),
});

export type GitWorktreeAddInput = z.infer<typeof GitWorktreeAddInputSchema>;

export interface GitWorktreeAddOutput {
  /** The absolute path of the new working tree */
  path: string;
  /** The commit that is checked out */
  head: string;
  /** The branch that is checked out, if there is one */
  branch?: string | undefined;
}

export const GitWorktreeRemoveInputSchema: z.ZodObject<{
  path: z.ZodString;
  force: z.ZodOptional<z.ZodBoolean>;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  path: z.string().describe("The folder of the working tree"),
  force: z.boolean().optional().describe("Remove it also with changes that are not committed. They are lost (default: false)"),
  cwd: z.string().optional().describe("Working directory"),
});

export type GitWorktreeRemoveInput = z.infer<typeof GitWorktreeRemoveInputSchema>;

export interface GitWorktreeRemoveOutput {
  /** The path of the removed working tree */
  path: string;
}

// =============================================================================
// git.branch.* Types - Branches (roadmap R40). They replace git.branch.
// =============================================================================

export const GitBranchListInputSchema: z.ZodObject<{
  remote: z.ZodOptional<z.ZodBoolean>;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  remote: z.boolean().optional().describe("Also list the remote-tracking branches (default: false)"),
  cwd: z.string().optional().describe("Working directory"),
});

export type GitBranchListInput = z.infer<typeof GitBranchListInputSchema>;

export interface GitBranchListOutput {
  branches: GitBranchInfo[];
  /** The current branch ("HEAD" when detached). A repository without commits has it too. */
  current: string;
}

export const GitBranchAddInputSchema: z.ZodObject<{
  name: z.ZodString;
  startPoint: z.ZodOptional<z.ZodString>;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  name: z.string().describe("The branch name"),
  startPoint: z.string().optional().describe("The commit of the new branch (default: HEAD)"),
  cwd: z.string().optional().describe("Working directory"),
});

export type GitBranchAddInput = z.infer<typeof GitBranchAddInputSchema>;

export interface GitBranchAddOutput {
  name: string;
  /** The commit of the new branch */
  hash: string;
}

export const GitBranchDeleteInputSchema: z.ZodObject<{
  name: z.ZodString;
  force: z.ZodOptional<z.ZodBoolean>;
  cwd: z.ZodOptional<z.ZodString>;
}> = z.object({
  name: z.string().describe("The branch name"),
  force: z.boolean().optional().describe("Delete it also when it is not merged. Its commits can be lost (default: false)"),
  cwd: z.string().optional().describe("Working directory"),
});

export type GitBranchDeleteInput = z.infer<typeof GitBranchDeleteInputSchema>;

export interface GitBranchDeleteOutput {
  name: string;
  /** The last commit of the deleted branch: git.branch.add with it makes the branch again */
  hash: string;
}

// =============================================================================
// Output schemas of the procedures of roadmap R40
// =============================================================================

const diffFile = z.looseObject({
  path: z.string().describe("The path of the file (for a rename, the new path)"),
  from: z.string().optional().describe("For a rename, the old path"),
  additions: z.number().describe("The added lines (0 for a binary file)"),
  deletions: z.number().describe("The deleted lines (0 for a binary file)"),
});

export const GitShowOutputSchema: z.ZodType<GitShowOutput> = z.looseObject({
  ref: z.string().describe("The ref of the input"),
  hash: z.string().describe("The hash of the commit"),
  shortHash: z.string().optional().describe("The short hash"),
  author: z.string().optional().describe("The author name"),
  email: z.string().optional().describe("The author email"),
  date: z.string().optional().describe("The author date"),
  message: z.string().optional().describe("The subject of the commit message"),
  body: z.string().optional().describe("The commit message after the subject"),
  files: z.array(diffFile).optional().describe("The changed files, against the first parent"),
  additions: z.number().optional().describe("The added lines of all files"),
  deletions: z.number().optional().describe("The deleted lines of all files"),
  diff: z.string().optional().describe("The text of the diff"),
  path: z.string().optional().describe("With path: the file"),
  content: z.string().optional().describe("With path: the content of the file at the commit"),
});

export const GitBlameOutputSchema: z.ZodType<GitBlameOutput> = z.looseObject({
  path: z.string().describe("The file"),
  lines: z
    .array(
      z.looseObject({
        line: z.number().describe("The line number (1 is the first line)"),
        hash: z.string().describe("The commit that last changed the line (zeros when it is not committed)"),
        author: z.string().describe("The author name"),
        email: z.string().describe("The author email"),
        date: z.string().describe("The author date, as an ISO 8601 string"),
        summary: z.string().describe("The subject of the commit"),
        content: z.string().describe("The text of the line"),
      })
    )
    .describe("The lines of the file"),
});

export const GitTagListOutputSchema: z.ZodType<GitTagListOutput> = z.looseObject({
  tags: z
    .array(
      z.looseObject({
        name: z.string().describe("The tag name"),
        hash: z.string().describe("The commit of the tag"),
        annotated: z.boolean().describe("True for an annotated tag"),
        message: z.string().optional().describe("For an annotated tag: the subject of its message"),
      })
    )
    .describe("The tags, sorted by name"),
});

export const GitTagAddOutputSchema: z.ZodType<GitTagAddOutput> = z.looseObject({
  name: z.string().describe("The tag name"),
  hash: z.string().describe("The commit of the tag"),
  annotated: z.boolean().describe("True for an annotated tag"),
});

export const GitTagDeleteOutputSchema: z.ZodType<GitTagDeleteOutput> = z.looseObject({
  name: z.string().describe("The tag name"),
  hash: z.string().describe("The object of the deleted tag"),
});

export const GitRevParseOutputSchema: z.ZodType<GitRevParseOutput> = z.looseObject({
  ref: z.string().describe("The ref of the input"),
  value: z.string().describe("The hash, the short hash or the short name"),
});

export const GitResetOutputSchema: z.ZodType<GitResetOutput> = z.looseObject({
  ref: z.string().describe("The commit of the reset"),
  mode: z.enum(["soft", "mixed", "hard", "merge", "keep"]).describe("The mode of the reset"),
  hash: z.string().describe("HEAD after the reset"),
});

export const GitRestoreOutputSchema: z.ZodType<GitRestoreOutput> = z.looseObject({
  restored: z.array(z.string()).describe("The paths of the input"),
});

export const GitMergeOutputSchema: z.ZodType<GitMergeOutput> = z.looseObject({
  ref: z.string().describe("The ref of the input"),
  hash: z.string().describe("HEAD after the call"),
  fastForward: z.boolean().describe("True for a fast-forward"),
  upToDate: z.boolean().describe("True when nothing changed"),
  conflict: z.boolean().describe("True when the merge stopped on conflicts"),
  conflicts: z.array(z.string()).optional().describe("The files with conflicts"),
});

export const GitMergeAbortOutputSchema: z.ZodType<GitMergeAbortOutput> = z.looseObject({
  aborted: z.boolean().describe("True when the merge was stopped"),
  hash: z.string().describe("HEAD after the call"),
});

export const GitRebaseOutputSchema: z.ZodType<GitRebaseOutput> = z.looseObject({
  hash: z.string().describe("HEAD after the call"),
  completed: z.boolean().describe("True when the rebase is complete"),
  upToDate: z.boolean().describe("True when nothing changed"),
  conflict: z.boolean().describe("True when the rebase stopped on conflicts"),
  conflicts: z.array(z.string()).optional().describe("The files with conflicts"),
});

export const GitRebaseContinueOutputSchema: z.ZodType<GitRebaseContinueOutput> = GitRebaseOutputSchema;

export const GitRebaseAbortOutputSchema: z.ZodType<GitRebaseAbortOutput> = z.looseObject({
  aborted: z.boolean().describe("True when the rebase was stopped"),
  hash: z.string().describe("HEAD after the call"),
});

export const GitWorktreeListOutputSchema: z.ZodType<GitWorktreeListOutput> = z.looseObject({
  worktrees: z
    .array(
      z.looseObject({
        path: z.string().describe("The absolute path of the working tree"),
        head: z.string().optional().describe("The commit that is checked out"),
        branch: z.string().optional().describe("The branch that is checked out"),
        detached: z.boolean().describe("True without a branch"),
        bare: z.boolean().describe("True for the bare repository"),
        locked: z.boolean().describe("True when the working tree is locked"),
        prunable: z.boolean().describe("True when the folder of the working tree is gone"),
      })
    )
    .describe("The working trees: the main one first"),
});

export const GitWorktreeAddOutputSchema: z.ZodType<GitWorktreeAddOutput> = z.looseObject({
  path: z.string().describe("The absolute path of the new working tree"),
  head: z.string().describe("The commit that is checked out"),
  branch: z.string().optional().describe("The branch that is checked out"),
});

export const GitWorktreeRemoveOutputSchema: z.ZodType<GitWorktreeRemoveOutput> = z.looseObject({
  path: z.string().describe("The path of the removed working tree"),
});

const branchInfo = z.looseObject({
  name: z.string().describe("The branch name"),
  current: z.boolean().describe("True for the current branch"),
  remote: z.boolean().describe("True for a remote-tracking branch"),
  tracking: z.string().optional().describe("The upstream of the branch"),
});

export const GitBranchListOutputSchema: z.ZodType<GitBranchListOutput> = z.looseObject({
  branches: z.array(branchInfo).describe("The branches"),
  current: z.string().describe('The current branch ("HEAD" when detached)'),
});

export const GitBranchAddOutputSchema: z.ZodType<GitBranchAddOutput> = z.looseObject({
  name: z.string().describe("The branch name"),
  hash: z.string().describe("The commit of the new branch"),
});

export const GitBranchDeleteOutputSchema: z.ZodType<GitBranchDeleteOutput> = z.looseObject({
  name: z.string().describe("The branch name"),
  hash: z.string().describe("The last commit of the deleted branch"),
});
