/**
 * Module (no side effects): the procedures of this package as data, for `createRegistry()`.
 *
 * Procedure Registration for git operations
 *
 * Registers git.* procedures with the client system.
 * This file is referenced by package.json's client.procedures field.
 */

import { createProcedure, zodAdapter, defineModule, type AnyProcedure, type Effects, type FsRootRules, type ProcedureModule, PROCEDURE_REGISTRY, registerModules, type ProcedureRegistry } from "@procedures/client";
import { gitStatus } from "./procedures/git/status.js";
import { gitAdd } from "./procedures/git/add.js";
import { gitCommit } from "./procedures/git/commit.js";
import { gitPush } from "./procedures/git/push.js";
import { gitPull } from "./procedures/git/pull.js";
import { gitClone } from "./procedures/git/clone.js";
import { gitCheckout } from "./procedures/git/checkout.js";
import { gitBranch } from "./procedures/git/branch.js";
import { gitLog } from "./procedures/git/log.js";
import { gitDiff } from "./procedures/git/diff.js";
import { gitInit } from "./procedures/git/init.js";
import { gitRemote, gitRemoteSet } from "./procedures/git/remote.js";
import { gitFetch } from "./procedures/git/fetch.js";
import {
  gitHasChanges,
  gitHasStagedChanges,
  gitHasUnstagedChanges,
  gitHasUntrackedFiles,
  gitHasLocalCommits,
  gitIsClean,
} from "./procedures/git/predicates.js";
import {
  gitStashList,
  gitStashPush,
  gitStashPop,
  gitStashApply,
  gitStashDrop,
  gitStashExport,
  gitStashImport,
} from "./procedures/git/stash.js";
import {
  GitStatusInputSchema,
  GitAddInputSchema,
  GitCommitInputSchema,
  GitPushInputSchema,
  GitPullInputSchema,
  GitCloneInputSchema,
  GitCheckoutInputSchema,
  GitBranchInputSchema,
  GitLogInputSchema,
  GitDiffInputSchema,
  type GitStatusInput,
  type GitStatusOutput,
  type GitAddInput,
  type GitAddOutput,
  type GitCommitInput,
  type GitCommitOutput,
  type GitPushInput,
  type GitPushOutput,
  type GitPullInput,
  type GitPullOutput,
  type GitCloneInput,
  type GitCloneOutput,
  type GitCheckoutInput,
  type GitCheckoutOutput,
  type GitBranchInput,
  type GitBranchOutput,
  type GitLogInput,
  type GitLogOutput,
  type GitDiffInput,
  type GitDiffOutput,
  GitInitInputSchema,
  type GitInitInput,
  type GitInitOutput,
  GitRemoteInputSchema,
  type GitRemoteInput,
  GitRemoteSetInputSchema,
  type GitRemoteSetInput,
  type GitRemoteOutput,
  GitFetchInputSchema,
  type GitFetchInput,
  type GitFetchOutput,
  GitPredicateInputSchema,
  type GitPredicateInput,
  type GitPredicateOutput,
  GitStashListInputSchema,
  GitStashPushInputSchema,
  GitStashPopInputSchema,
  GitStashApplyInputSchema,
  GitStashDropInputSchema,
  GitStashExportInputSchema,
  GitStashImportInputSchema,
  type GitStashListInput,
  type GitStashListOutput,
  type GitStashPushInput,
  type GitStashPushOutput,
  type GitStashPopInput,
  type GitStashPopOutput,
  type GitStashApplyInput,
  type GitStashApplyOutput,
  type GitStashDropInput,
  type GitStashDropOutput,
  type GitStashExportInput,
  type GitStashExportOutput,
  type GitStashImportInput,
  type GitStashImportOutput,
  GitStatusOutputSchema,
  GitAddOutputSchema,
  GitCommitOutputSchema,
  GitPushOutputSchema,
  GitPullOutputSchema,
  GitCloneOutputSchema,
  GitCheckoutOutputSchema,
  GitBranchOutputSchema,
  GitLogOutputSchema,
  GitDiffOutputSchema,
  GitInitOutputSchema,
  GitRemoteOutputSchema,
  GitFetchOutputSchema,
  GitPredicateOutputSchema,
  GitStashListOutputSchema,
  GitStashPushOutputSchema,
  GitStashPopOutputSchema,
  GitStashApplyOutputSchema,
  GitStashDropOutputSchema,
  GitStashExportOutputSchema,
  GitStashImportOutputSchema,
} from "./types.js";
import { gitShow } from "./procedures/git/show.js";
import { gitBlame } from "./procedures/git/blame.js";
import { gitTagList } from "./procedures/git/tag/list.js";
import { gitTagAdd } from "./procedures/git/tag/add.js";
import { gitTagDelete } from "./procedures/git/tag/delete.js";
import { gitRevParse } from "./procedures/git/revParse.js";
import { gitReset } from "./procedures/git/reset.js";
import { gitRestore } from "./procedures/git/restore.js";
import { gitMerge } from "./procedures/git/merge.js";
import { gitMergeAbort } from "./procedures/git/merge/abort.js";
import { gitRebase } from "./procedures/git/rebase.js";
import { gitRebaseContinue } from "./procedures/git/rebase/continue.js";
import { gitRebaseAbort } from "./procedures/git/rebase/abort.js";
import { gitWorktreeList } from "./procedures/git/worktree/list.js";
import { gitWorktreeAdd } from "./procedures/git/worktree/add.js";
import { gitWorktreeRemove } from "./procedures/git/worktree/remove.js";
import { gitBranchList } from "./procedures/git/branch/list.js";
import { gitBranchAdd } from "./procedures/git/branch/add.js";
import { gitBranchDelete } from "./procedures/git/branch/delete.js";
import {
  GitShowInputSchema,
  GitShowOutputSchema,
  type GitShowInput,
  type GitShowOutput,
  GitBlameInputSchema,
  GitBlameOutputSchema,
  type GitBlameInput,
  type GitBlameOutput,
  GitTagListInputSchema,
  GitTagListOutputSchema,
  type GitTagListInput,
  type GitTagListOutput,
  GitTagAddInputSchema,
  GitTagAddOutputSchema,
  type GitTagAddInput,
  type GitTagAddOutput,
  GitTagDeleteInputSchema,
  GitTagDeleteOutputSchema,
  type GitTagDeleteInput,
  type GitTagDeleteOutput,
  GitRevParseInputSchema,
  GitRevParseOutputSchema,
  type GitRevParseInput,
  type GitRevParseOutput,
  GitResetInputSchema,
  GitResetOutputSchema,
  type GitResetInput,
  type GitResetOutput,
  GitRestoreInputSchema,
  GitRestoreOutputSchema,
  type GitRestoreInput,
  type GitRestoreOutput,
  GitMergeInputSchema,
  GitMergeOutputSchema,
  type GitMergeInput,
  type GitMergeOutput,
  GitMergeAbortInputSchema,
  GitMergeAbortOutputSchema,
  type GitMergeAbortInput,
  type GitMergeAbortOutput,
  GitRebaseInputSchema,
  GitRebaseOutputSchema,
  type GitRebaseInput,
  type GitRebaseOutput,
  GitRebaseContinueInputSchema,
  GitRebaseContinueOutputSchema,
  type GitRebaseContinueInput,
  type GitRebaseContinueOutput,
  GitRebaseAbortInputSchema,
  GitRebaseAbortOutputSchema,
  type GitRebaseAbortInput,
  type GitRebaseAbortOutput,
  GitWorktreeListInputSchema,
  GitWorktreeListOutputSchema,
  type GitWorktreeListInput,
  type GitWorktreeListOutput,
  GitWorktreeAddInputSchema,
  GitWorktreeAddOutputSchema,
  type GitWorktreeAddInput,
  type GitWorktreeAddOutput,
  GitWorktreeRemoveInputSchema,
  GitWorktreeRemoveOutputSchema,
  type GitWorktreeRemoveInput,
  type GitWorktreeRemoveOutput,
  GitBranchListInputSchema,
  GitBranchListOutputSchema,
  type GitBranchListInput,
  type GitBranchListOutput,
  GitBranchAddInputSchema,
  GitBranchAddOutputSchema,
  type GitBranchAddInput,
  type GitBranchAddOutput,
  GitBranchDeleteInputSchema,
  GitBranchDeleteOutputSchema,
  type GitBranchDeleteInput,
  type GitBranchDeleteOutput,
} from "./types.js";

// =============================================================================
// Effects
// =============================================================================

// Git is a fixed program, so the declarations name what git reads and changes, not "process".
// They do not include the hooks of a repository.

/** The effects of a git command that reads the repository and changes nothing. */
const READS_REPOSITORY: Effects = { reads: ["fs"], writes: [] };

/** The effects of a git command that can replace or remove the data of the repository. */
const CHANGES_REPOSITORY: Effects = { reads: ["fs"], writes: ["fs"] };

/**
 * A change that starts the hooks of the repository (commit, push, pull, checkout). A hook is code
 * of the project (husky, for example), so these write process (CAPABILITIES-2026-10). A hook
 * that only the reference-transaction event starts (branch, fetch, stash) is not counted.
 */
const RUNS_HOOKS: Effects = { reads: ["fs"], writes: ["fs", "process"] };

/**
 * The rule of each git procedure under a root of the files (roadmap R33): a host with a root
 * refuses it. A root cannot keep git in its folder for two reasons:
 * - Git looks for the repository in the folders above the working folder, so a working folder in
 *   the root can open a repository outside it.
 * - The configuration of a repository can start a program: a hook, `core.fsmonitor` or a filter.
 *   A client with `fs.write` in the root can write that configuration.
 */
const REFUSED_UNDER_A_ROOT: FsRootRules = {
  refuse: "the configuration of a repository can start a program (a hook, core.fsmonitor, a filter), and git looks for the repository in the folders above the working folder",
};

/** The procedure with the rule of a root. */
function underARoot(procedure: AnyProcedure): AnyProcedure {
  return { ...procedure, metadata: { ...procedure.metadata, fsRoot: REFUSED_UNDER_A_ROOT } };
}

// =============================================================================
// Procedure Definitions
// =============================================================================

const gitStatusProcedure = createProcedure()
  .path(["git", "status"])
  .input(zodAdapter<GitStatusInput>(GitStatusInputSchema))
  .output(zodAdapter<GitStatusOutput>(GitStatusOutputSchema))
  .meta({
    description: "Get git status",
    args: ["paths"],
    shorts: { cwd: "C", short: "s", untrackedFiles: "u" },
    output: "json",
    effects: READS_REPOSITORY,
  })
  .handler(async (input: GitStatusInput, ctx): Promise<GitStatusOutput> => {
    return gitStatus(input, ctx);
  })
  .build();

const gitAddProcedure = createProcedure()
  .path(["git", "add"])
  .input(zodAdapter<GitAddInput>(GitAddInputSchema))
  .output(zodAdapter<GitAddOutput>(GitAddOutputSchema))
  .meta({
    description: "Stage files",
    args: ["paths"],
    shorts: { all: "A", cwd: "C" },
    output: "json",
    effects: { reads: ["fs"], writes: ["fs"], destructive: false, idempotent: true },
  })
  .handler(async (input: GitAddInput, ctx): Promise<GitAddOutput> => {
    return gitAdd(input, ctx);
  })
  .build();

const gitCommitProcedure = createProcedure()
  .path(["git", "commit"])
  .input(zodAdapter<GitCommitInput>(GitCommitInputSchema))
  .output(zodAdapter<GitCommitOutput>(GitCommitOutputSchema))
  .meta({
    description: "Create commit",
    args: ["message"],
    shorts: { message: "m", all: "a", amend: "A", cwd: "C" },
    output: "json",
    // With `amend`, it replaces the last commit, so it is destructive
    effects: RUNS_HOOKS,
  })
  .handler(async (input: GitCommitInput, ctx): Promise<GitCommitOutput> => {
    return gitCommit(input, ctx);
  })
  .build();

const gitPushProcedure = createProcedure()
  .path(["git", "push"])
  .input(zodAdapter<GitPushInput>(GitPushInputSchema))
  .output(zodAdapter<GitPushOutput>(GitPushOutputSchema))
  .meta({
    description: "Push to remote",
    args: [],
    shorts: { remote: "r", branch: "b", force: "f", setUpstream: "u", cwd: "C" },
    output: "json",
    // With `force`, it replaces the commits of the remote. It also writes the remote-tracking ref.
    effects: { reads: ["fs", "network"], writes: ["fs", "network", "process"], idempotent: true },
  })
  .handler(async (input: GitPushInput, ctx): Promise<GitPushOutput> => {
    return gitPush(input, ctx);
  })
  .build();

const gitPullProcedure = createProcedure()
  .path(["git", "pull"])
  .input(zodAdapter<GitPullInput>(GitPullInputSchema))
  .output(zodAdapter<GitPullOutput>(GitPullOutputSchema))
  .meta({
    description: "Pull from remote",
    args: [],
    shorts: { remote: "r", branch: "b", rebase: "R", cwd: "C" },
    output: "json",
    // It merges or rebases into the working tree
    effects: { reads: ["fs", "network"], writes: ["fs", "process"], idempotent: true },
  })
  .handler(async (input: GitPullInput, ctx): Promise<GitPullOutput> => {
    return gitPull(input, ctx);
  })
  .build();

const gitCloneProcedure = createProcedure()
  .path(["git", "clone"])
  .input(zodAdapter<GitCloneInput>(GitCloneInputSchema))
  .output(zodAdapter<GitCloneOutput>(GitCloneOutputSchema))
  .meta({
    description: "Clone repository",
    args: ["url"],
    shorts: { dest: "d", branch: "b", depth: "D", cwd: "C" },
    output: "json",
    // The source can be a local path. Git clones only into a new or empty folder.
    effects: { reads: ["fs", "network"], writes: ["fs"], destructive: false, idempotent: true },
  })
  .handler(async (input: GitCloneInput, ctx): Promise<GitCloneOutput> => {
    return gitClone(input, ctx);
  })
  .build();

const gitCheckoutProcedure = createProcedure()
  .path(["git", "checkout"])
  .input(zodAdapter<GitCheckoutInput>(GitCheckoutInputSchema))
  .output(zodAdapter<GitCheckoutOutput>(GitCheckoutOutputSchema))
  .meta({
    description: "Checkout branch or files",
    args: ["ref"],
    shorts: { create: "b", cwd: "C" },
    output: "json",
    // It replaces files of the working tree
    effects: { reads: ["fs"], writes: ["fs", "process"], idempotent: true },
  })
  .handler(async (input: GitCheckoutInput, ctx): Promise<GitCheckoutOutput> => {
    return gitCheckout(input, ctx);
  })
  .build();

const gitBranchProcedure = createProcedure()
  .path(["git", "branch"])
  .input(zodAdapter<GitBranchInput>(GitBranchInputSchema))
  .output(zodAdapter<GitBranchOutput>(GitBranchOutputSchema))
  .meta({
    description: "Deprecated: use git.branch.list, git.branch.add or git.branch.delete. Branch operations",
    // Roadmap R40: it stays for one release, and calls the code of the three new procedures
    deprecated: true,
    deprecationMessage: "Use git.branch.list, git.branch.add or git.branch.delete. git.branch goes away in the next release.",
    args: ["name"],
    shorts: { delete: "d", list: "l", remote: "r", cwd: "C" },
    output: "json",
    // It lists, creates or deletes a branch
    effects: { reads: ["fs"], writes: ["fs"], idempotent: true },
  })
  .handler(async (input: GitBranchInput, ctx): Promise<GitBranchOutput> => {
    return gitBranch(input, ctx);
  })
  .build();

const gitLogProcedure = createProcedure()
  .path(["git", "log"])
  .input(zodAdapter<GitLogInput>(GitLogInputSchema))
  .output(zodAdapter<GitLogOutput>(GitLogOutputSchema))
  .meta({
    description: "Show commit log",
    args: [],
    shorts: { count: "n", oneline: "o", ref: "r", cwd: "C" },
    output: "json",
    effects: READS_REPOSITORY,
  })
  .handler(async (input: GitLogInput, ctx): Promise<GitLogOutput> => {
    return gitLog(input, ctx);
  })
  .build();

const gitDiffProcedure = createProcedure()
  .path(["git", "diff"])
  .input(zodAdapter<GitDiffInput>(GitDiffInputSchema))
  .output(zodAdapter<GitDiffOutput>(GitDiffOutputSchema))
  .meta({
    description: "Show changes",
    args: [],
    shorts: { staged: "s", ref: "r", stat: "S", cwd: "C" },
    output: "json",
    effects: READS_REPOSITORY,
  })
  .handler(async (input: GitDiffInput, ctx): Promise<GitDiffOutput> => {
    return gitDiff(input, ctx);
  })
  .build();


const gitInitProcedure = createProcedure()
  .path(["git", "init"])
  .input(zodAdapter<GitInitInput>(GitInitInputSchema))
  .output(zodAdapter<GitInitOutput>(GitInitOutputSchema))
  .meta({
    description: "Initialize a git repository",
    args: [],
    shorts: { cwd: "C", bare: "b", initialBranch: "B" },
    output: "json",
    // It runs `git init` only when the folder has no .git
    effects: { reads: ["fs"], writes: ["fs"], destructive: false, idempotent: true },
  })
  .handler(async (input: GitInitInput, ctx): Promise<GitInitOutput> => {
    return gitInit(input, ctx);
  })
  .build();

const gitRemoteProcedure = createProcedure()
  .path(["git", "remote"])
  .input(zodAdapter<GitRemoteInput>(GitRemoteInputSchema))
  .output(zodAdapter<GitRemoteOutput>(GitRemoteOutputSchema))
  .meta({
    description: "Get the URL of a remote",
    args: [],
    shorts: { name: "n", cwd: "C" },
    output: "json",
    effects: { reads: ["fs"], writes: [] },
  })
  .handler(async (input: GitRemoteInput, ctx): Promise<GitRemoteOutput> => {
    return gitRemote(input, ctx);
  })
  .build();

const gitRemoteSetProcedure = createProcedure()
  .path(["git", "remote", "set"])
  .input(zodAdapter<GitRemoteSetInput>(GitRemoteSetInputSchema))
  .output(zodAdapter<GitRemoteOutput>(GitRemoteOutputSchema))
  .meta({
    description: "Set the URL of a remote, or add the remote",
    args: ["url"],
    shorts: { name: "n", cwd: "C" },
    output: "json",
    // It replaces the URL of the remote in the git configuration
    effects: { reads: ["fs"], writes: ["fs"], idempotent: true },
  })
  .handler(async (input: GitRemoteSetInput, ctx): Promise<GitRemoteOutput> => {
    return gitRemoteSet(input, ctx);
  })
  .build();

const gitFetchProcedure = createProcedure()
  .path(["git", "fetch"])
  .input(zodAdapter<GitFetchInput>(GitFetchInputSchema))
  .output(zodAdapter<GitFetchOutput>(GitFetchOutputSchema))
  .meta({
    description: "Fetch from remote",
    args: [],
    shorts: { remote: "r", branch: "b", all: "a", prune: "p", cwd: "C" },
    output: "json",
    // With `prune`, it deletes remote-tracking refs
    effects: { reads: ["fs", "network"], writes: ["fs"], idempotent: true },
  })
  .handler(async (input: GitFetchInput, ctx): Promise<GitFetchOutput> => {
    return gitFetch(input, ctx);
  })
  .build();

// =============================================================================
// Predicate Procedures (boolean checks for conditionals)
// =============================================================================

const gitHasChangesProcedure = createProcedure()
  .path(["git", "hasChanges"])
  .input(zodAdapter<GitPredicateInput>(GitPredicateInputSchema))
  .output(zodAdapter<GitPredicateOutput>(GitPredicateOutputSchema))
  .meta({
    description: "Check if there are any changes (unstaged, staged, or untracked)",
    args: [],
    shorts: { cwd: "C" },
    output: "json",
    effects: READS_REPOSITORY,
  })
  .handler(async (input: GitPredicateInput, ctx): Promise<GitPredicateOutput> => {
    return gitHasChanges(input, ctx);
  })
  .build();

const gitHasStagedChangesProcedure = createProcedure()
  .path(["git", "hasStagedChanges"])
  .input(zodAdapter<GitPredicateInput>(GitPredicateInputSchema))
  .output(zodAdapter<GitPredicateOutput>(GitPredicateOutputSchema))
  .meta({
    description: "Check if there are any staged changes ready to commit",
    args: [],
    shorts: { cwd: "C" },
    output: "json",
    effects: READS_REPOSITORY,
  })
  .handler(async (input: GitPredicateInput, ctx): Promise<GitPredicateOutput> => {
    return gitHasStagedChanges(input, ctx);
  })
  .build();

const gitHasUnstagedChangesProcedure = createProcedure()
  .path(["git", "hasUnstagedChanges"])
  .input(zodAdapter<GitPredicateInput>(GitPredicateInputSchema))
  .output(zodAdapter<GitPredicateOutput>(GitPredicateOutputSchema))
  .meta({
    description: "Check if there are any unstaged changes",
    args: [],
    shorts: { cwd: "C" },
    output: "json",
    effects: READS_REPOSITORY,
  })
  .handler(async (input: GitPredicateInput, ctx): Promise<GitPredicateOutput> => {
    return gitHasUnstagedChanges(input, ctx);
  })
  .build();

const gitHasUntrackedFilesProcedure = createProcedure()
  .path(["git", "hasUntrackedFiles"])
  .input(zodAdapter<GitPredicateInput>(GitPredicateInputSchema))
  .output(zodAdapter<GitPredicateOutput>(GitPredicateOutputSchema))
  .meta({
    description: "Check if there are any untracked files",
    args: [],
    shorts: { cwd: "C" },
    output: "json",
    effects: READS_REPOSITORY,
  })
  .handler(async (input: GitPredicateInput, ctx): Promise<GitPredicateOutput> => {
    return gitHasUntrackedFiles(input, ctx);
  })
  .build();

const gitHasLocalCommitsProcedure = createProcedure()
  .path(["git", "hasLocalCommits"])
  .input(zodAdapter<GitPredicateInput>(GitPredicateInputSchema))
  .output(zodAdapter<GitPredicateOutput>(GitPredicateOutputSchema))
  .meta({
    description: "Check if there are local commits that haven't been pushed",
    args: [],
    shorts: { cwd: "C" },
    output: "json",
    // It compares with the local remote-tracking ref and does not fetch
    effects: READS_REPOSITORY,
  })
  .handler(async (input: GitPredicateInput, ctx): Promise<GitPredicateOutput> => {
    return gitHasLocalCommits(input, ctx);
  })
  .build();

const gitIsCleanProcedure = createProcedure()
  .path(["git", "isClean"])
  .input(zodAdapter<GitPredicateInput>(GitPredicateInputSchema))
  .output(zodAdapter<GitPredicateOutput>(GitPredicateOutputSchema))
  .meta({
    description: "Check if the working directory is clean",
    args: [],
    shorts: { cwd: "C" },
    output: "json",
    effects: READS_REPOSITORY,
  })
  .handler(async (input: GitPredicateInput, ctx): Promise<GitPredicateOutput> => {
    return gitIsClean(input, ctx);
  })
  .build();

// =============================================================================
// Stash Procedures
// =============================================================================

const gitStashListProcedure = createProcedure()
  .path(["git", "stash", "list"])
  .input(zodAdapter<GitStashListInput>(GitStashListInputSchema))
  .output(zodAdapter<GitStashListOutput>(GitStashListOutputSchema))
  .meta({
    description: "List all stashes",
    args: [],
    shorts: { cwd: "C" },
    output: "json",
    effects: READS_REPOSITORY,
  })
  .handler(async (input: GitStashListInput, ctx): Promise<GitStashListOutput> => {
    return gitStashList(input, ctx);
  })
  .build();

const gitStashPushProcedure = createProcedure()
  .path(["git", "stash", "push"])
  .input(zodAdapter<GitStashPushInput>(GitStashPushInputSchema))
  .output(zodAdapter<GitStashPushOutput>(GitStashPushOutputSchema))
  .meta({
    description: "Push changes to stash",
    args: ["message"],
    shorts: { message: "m", includeUntracked: "u", keepIndex: "k", cwd: "C" },
    output: "json",
    // It removes the changes from the working tree. With `keepIndex`, a second call stashes again.
    effects: CHANGES_REPOSITORY,
  })
  .handler(async (input: GitStashPushInput, ctx): Promise<GitStashPushOutput> => {
    return gitStashPush(input, ctx);
  })
  .build();

const gitStashPopProcedure = createProcedure()
  .path(["git", "stash", "pop"])
  .input(zodAdapter<GitStashPopInput>(GitStashPopInputSchema))
  .output(zodAdapter<GitStashPopOutput>(GitStashPopOutputSchema))
  .meta({
    description: "Pop stash (apply and remove)",
    args: [],
    shorts: { index: "n", cwd: "C" },
    output: "json",
    effects: CHANGES_REPOSITORY,
  })
  .handler(async (input: GitStashPopInput, ctx): Promise<GitStashPopOutput> => {
    return gitStashPop(input, ctx);
  })
  .build();

const gitStashApplyProcedure = createProcedure()
  .path(["git", "stash", "apply"])
  .input(zodAdapter<GitStashApplyInput>(GitStashApplyInputSchema))
  .output(zodAdapter<GitStashApplyOutput>(GitStashApplyOutputSchema))
  .meta({
    description: "Apply stash without removing",
    args: [],
    shorts: { index: "n", cwd: "C" },
    output: "json",
    effects: CHANGES_REPOSITORY,
  })
  .handler(async (input: GitStashApplyInput, ctx): Promise<GitStashApplyOutput> => {
    return gitStashApply(input, ctx);
  })
  .build();

const gitStashDropProcedure = createProcedure()
  .path(["git", "stash", "drop"])
  .input(zodAdapter<GitStashDropInput>(GitStashDropInputSchema))
  .output(zodAdapter<GitStashDropOutput>(GitStashDropOutputSchema))
  .meta({
    description: "Drop a stash",
    args: [],
    shorts: { index: "n", cwd: "C" },
    output: "json",
    effects: CHANGES_REPOSITORY,
  })
  .handler(async (input: GitStashDropInput, ctx): Promise<GitStashDropOutput> => {
    return gitStashDrop(input, ctx);
  })
  .build();

const gitStashExportProcedure = createProcedure()
  .path(["git", "stash", "export"])
  .input(zodAdapter<GitStashExportInput>(GitStashExportInputSchema))
  .output(zodAdapter<GitStashExportOutput>(GitStashExportOutputSchema))
  .meta({
    description: "Export stash as patch for snapshot storage",
    args: [],
    shorts: { index: "n", cwd: "C" },
    output: "json",
    effects: READS_REPOSITORY,
  })
  .handler(async (input: GitStashExportInput, ctx): Promise<GitStashExportOutput> => {
    return gitStashExport(input, ctx);
  })
  .build();

const gitStashImportProcedure = createProcedure()
  .path(["git", "stash", "import"])
  .input(zodAdapter<GitStashImportInput>(GitStashImportInputSchema))
  .output(zodAdapter<GitStashImportOutput>(GitStashImportOutputSchema))
  .meta({
    description: "Import stash from patch",
    args: ["patch"],
    shorts: { message: "m", includeUntracked: "u", cwd: "C" },
    output: "json",
    // It applies the patch to the working tree, then stashes all the changes of the working tree
    effects: CHANGES_REPOSITORY,
  })
  .handler(async (input: GitStashImportInput, ctx): Promise<GitStashImportOutput> => {
    return gitStashImport(input, ctx);
  })
  .build();

// =============================================================================
// Roadmap R40: show, blame, tags, rev-parse, reset, restore, merge, rebase, worktrees, branches
// =============================================================================

/** A new ref (a tag or a branch). Git refuses a ref that exists, so a second call changes nothing. */
const ADDS_REF: Effects = { reads: ["fs"], writes: ["fs"], destructive: false, idempotent: true };

/**
 * A deletion: of a ref, a working tree, or the state of a stopped merge or rebase. A second call
 * fails, and changes nothing.
 */
const DELETES: Effects = { reads: ["fs"], writes: ["fs"], destructive: true, idempotent: true };

const gitShowProcedure = createProcedure()
  .path(["git", "show"])
  .input(zodAdapter<GitShowInput>(GitShowInputSchema))
  .output(zodAdapter<GitShowOutput>(GitShowOutputSchema))
  .meta({
    description: "Show a commit (its fields, files and diff), or a file at a commit",
    args: ["ref"],
    shorts: { path: "p", stat: "s", cwd: "C" },
    output: "json",
    effects: READS_REPOSITORY,
  })
  .handler(async (input: GitShowInput, ctx): Promise<GitShowOutput> => gitShow(input, ctx))
  .build();

const gitBlameProcedure = createProcedure()
  .path(["git", "blame"])
  .input(zodAdapter<GitBlameInput>(GitBlameInputSchema))
  .output(zodAdapter<GitBlameOutput>(GitBlameOutputSchema))
  .meta({
    description: "Show the commit and the author of each line of a file",
    args: ["path"],
    shorts: { ref: "r", cwd: "C" },
    output: "json",
    effects: READS_REPOSITORY,
  })
  .handler(async (input: GitBlameInput, ctx): Promise<GitBlameOutput> => gitBlame(input, ctx))
  .build();

const gitTagListProcedure = createProcedure()
  .path(["git", "tag", "list"])
  .input(zodAdapter<GitTagListInput>(GitTagListInputSchema))
  .output(zodAdapter<GitTagListOutput>(GitTagListOutputSchema))
  .meta({
    description: "List the tags, with their commits",
    args: ["pattern"],
    shorts: { cwd: "C" },
    output: "json",
    effects: READS_REPOSITORY,
  })
  .handler(async (input: GitTagListInput, ctx): Promise<GitTagListOutput> => gitTagList(input, ctx))
  .build();

const gitTagAddProcedure = createProcedure()
  .path(["git", "tag", "add"])
  .input(zodAdapter<GitTagAddInput>(GitTagAddInputSchema))
  .output(zodAdapter<GitTagAddOutput>(GitTagAddOutputSchema))
  .meta({
    description: "Make a tag. With a message, the tag is annotated. An existing tag is an error",
    args: ["name", "ref"],
    shorts: { message: "m", cwd: "C" },
    output: "json",
    effects: ADDS_REF,
  })
  .handler(async (input: GitTagAddInput, ctx): Promise<GitTagAddOutput> => gitTagAdd(input, ctx))
  .build();

const gitTagDeleteProcedure = createProcedure()
  .path(["git", "tag", "delete"])
  .input(zodAdapter<GitTagDeleteInput>(GitTagDeleteInputSchema))
  .output(zodAdapter<GitTagDeleteOutput>(GitTagDeleteOutputSchema))
  .meta({
    description: "Delete a tag",
    args: ["name"],
    shorts: { cwd: "C" },
    output: "json",
    effects: DELETES,
  })
  .handler(async (input: GitTagDeleteInput, ctx): Promise<GitTagDeleteOutput> => gitTagDelete(input, ctx))
  .build();

const gitRevParseProcedure = createProcedure()
  .path(["git", "revParse"])
  .input(zodAdapter<GitRevParseInput>(GitRevParseInputSchema))
  .output(zodAdapter<GitRevParseOutput>(GitRevParseOutputSchema))
  .meta({
    description: "Give the hash or the short name of a ref. An unknown ref is an error",
    args: ["ref"],
    shorts: { abbrevRef: "a", short: "s", cwd: "C" },
    output: "json",
    effects: READS_REPOSITORY,
  })
  .handler(async (input: GitRevParseInput, ctx): Promise<GitRevParseOutput> => gitRevParse(input, ctx))
  .build();

const gitResetProcedure = createProcedure()
  .path(["git", "reset"])
  .input(zodAdapter<GitResetInput>(GitResetInputSchema))
  .output(zodAdapter<GitResetOutput>(GitResetOutputSchema))
  .meta({
    description: "Move HEAD to a commit, and reset the index (mixed) or also the working tree (hard)",
    args: ["ref"],
    shorts: { mode: "m", cwd: "C" },
    output: "json",
    // The mode hard deletes the changes that are not committed. A relative ref (HEAD~1) moves
    // HEAD again at a second call, so it is not idempotent.
    effects: { reads: ["fs"], writes: ["fs"], destructive: true },
  })
  .handler(async (input: GitResetInput, ctx): Promise<GitResetOutput> => gitReset(input, ctx))
  .build();

const gitRestoreProcedure = createProcedure()
  .path(["git", "restore"])
  .input(zodAdapter<GitRestoreInput>(GitRestoreInputSchema))
  .output(zodAdapter<GitRestoreOutput>(GitRestoreOutputSchema))
  .meta({
    description: "Restore files of the working tree or the index. The changes of the files are lost",
    args: ["paths"],
    shorts: { source: "s", staged: "S", worktree: "W", cwd: "C" },
    output: "json",
    // It replaces the changes of the files. Git starts the post-checkout hook for it.
    effects: { reads: ["fs"], writes: ["fs", "process"], destructive: true, idempotent: true },
  })
  .handler(async (input: GitRestoreInput, ctx): Promise<GitRestoreOutput> => gitRestore(input, ctx))
  .build();

const gitMergeProcedure = createProcedure()
  .path(["git", "merge"])
  .input(zodAdapter<GitMergeInput>(GitMergeInputSchema))
  .output(zodAdapter<GitMergeOutput>(GitMergeOutputSchema))
  .meta({
    description: "Merge a branch or a commit into the current branch. Conflicts give conflict: true",
    args: ["ref"],
    shorts: { message: "m", cwd: "C" },
    output: "json",
    // As git.pull: it changes the working tree, and starts the merge hooks
    effects: { reads: ["fs"], writes: ["fs", "process"], idempotent: true },
  })
  .handler(async (input: GitMergeInput, ctx): Promise<GitMergeOutput> => gitMerge(input, ctx))
  .build();

const gitMergeAbortProcedure = createProcedure()
  .path(["git", "merge", "abort"])
  .input(zodAdapter<GitMergeAbortInput>(GitMergeAbortInputSchema))
  .output(zodAdapter<GitMergeAbortOutput>(GitMergeAbortOutputSchema))
  .meta({
    description: "Stop a merge that has conflicts, and put back the state before it",
    args: [],
    shorts: { cwd: "C" },
    output: "json",
    // The resolutions of the conflicts are lost
    effects: DELETES,
  })
  .handler(async (input: GitMergeAbortInput, ctx): Promise<GitMergeAbortOutput> => gitMergeAbort(input, ctx))
  .build();

const gitRebaseProcedure = createProcedure()
  .path(["git", "rebase"])
  .input(zodAdapter<GitRebaseInput>(GitRebaseInputSchema))
  .output(zodAdapter<GitRebaseOutput>(GitRebaseOutputSchema))
  .meta({
    description: "Rebase the current branch on another branch (not interactive). Conflicts give conflict: true",
    args: ["upstream"],
    shorts: { onto: "o", branch: "b", cwd: "C" },
    output: "json",
    // It replaces the commits of the branch, and starts the rebase and checkout hooks
    effects: { reads: ["fs"], writes: ["fs", "process"], destructive: true, idempotent: true },
  })
  .handler(async (input: GitRebaseInput, ctx): Promise<GitRebaseOutput> => gitRebase(input, ctx))
  .build();

const gitRebaseContinueProcedure = createProcedure()
  .path(["git", "rebase", "continue"])
  .input(zodAdapter<GitRebaseContinueInput>(GitRebaseContinueInputSchema))
  .output(zodAdapter<GitRebaseContinueOutput>(GitRebaseContinueOutputSchema))
  .meta({
    description: "Continue a rebase after the conflicts are resolved and staged",
    args: [],
    shorts: { cwd: "C" },
    output: "json",
    effects: { reads: ["fs"], writes: ["fs", "process"], destructive: true },
  })
  .handler(async (input: GitRebaseContinueInput, ctx): Promise<GitRebaseContinueOutput> => gitRebaseContinue(input, ctx))
  .build();

const gitRebaseAbortProcedure = createProcedure()
  .path(["git", "rebase", "abort"])
  .input(zodAdapter<GitRebaseAbortInput>(GitRebaseAbortInputSchema))
  .output(zodAdapter<GitRebaseAbortOutput>(GitRebaseAbortOutputSchema))
  .meta({
    description: "Stop a rebase, and go back to the branch as it was before the rebase",
    args: [],
    shorts: { cwd: "C" },
    output: "json",
    // The resolutions of the conflicts are lost. Git starts no hook for it.
    effects: DELETES,
  })
  .handler(async (input: GitRebaseAbortInput, ctx): Promise<GitRebaseAbortOutput> => gitRebaseAbort(input, ctx))
  .build();

const gitWorktreeListProcedure = createProcedure()
  .path(["git", "worktree", "list"])
  .input(zodAdapter<GitWorktreeListInput>(GitWorktreeListInputSchema))
  .output(zodAdapter<GitWorktreeListOutput>(GitWorktreeListOutputSchema))
  .meta({
    description: "List the working trees of the repository",
    args: [],
    shorts: { cwd: "C" },
    output: "json",
    effects: READS_REPOSITORY,
  })
  .handler(async (input: GitWorktreeListInput, ctx): Promise<GitWorktreeListOutput> => gitWorktreeList(input, ctx))
  .build();

const gitWorktreeAddProcedure = createProcedure()
  .path(["git", "worktree", "add"])
  .input(zodAdapter<GitWorktreeAddInput>(GitWorktreeAddInputSchema))
  .output(zodAdapter<GitWorktreeAddOutput>(GitWorktreeAddOutputSchema))
  .meta({
    description: "Add a working tree in a new folder",
    args: ["path", "ref"],
    shorts: { branch: "b", detach: "d", cwd: "C" },
    output: "json",
    // Git refuses a folder that is not empty. It starts the post-checkout hook in the new folder.
    effects: { reads: ["fs"], writes: ["fs", "process"], destructive: false, idempotent: true },
  })
  .handler(async (input: GitWorktreeAddInput, ctx): Promise<GitWorktreeAddOutput> => gitWorktreeAdd(input, ctx))
  .build();

const gitWorktreeRemoveProcedure = createProcedure()
  .path(["git", "worktree", "remove"])
  .input(zodAdapter<GitWorktreeRemoveInput>(GitWorktreeRemoveInputSchema))
  .output(zodAdapter<GitWorktreeRemoveOutput>(GitWorktreeRemoveOutputSchema))
  .meta({
    description: "Remove a working tree and its folder",
    args: ["path"],
    shorts: { force: "f", cwd: "C" },
    output: "json",
    // With force, the changes of the working tree are lost
    effects: DELETES,
  })
  .handler(async (input: GitWorktreeRemoveInput, ctx): Promise<GitWorktreeRemoveOutput> => gitWorktreeRemove(input, ctx))
  .build();

const gitBranchListProcedure = createProcedure()
  .path(["git", "branch", "list"])
  .input(zodAdapter<GitBranchListInput>(GitBranchListInputSchema))
  .output(zodAdapter<GitBranchListOutput>(GitBranchListOutputSchema))
  .meta({
    description: "List the branches, and give the current branch",
    args: [],
    shorts: { remote: "r", cwd: "C" },
    output: "json",
    effects: READS_REPOSITORY,
  })
  .handler(async (input: GitBranchListInput, ctx): Promise<GitBranchListOutput> => gitBranchList(input, ctx))
  .build();

const gitBranchAddProcedure = createProcedure()
  .path(["git", "branch", "add"])
  .input(zodAdapter<GitBranchAddInput>(GitBranchAddInputSchema))
  .output(zodAdapter<GitBranchAddOutput>(GitBranchAddOutputSchema))
  .meta({
    description: "Make a branch. An existing branch is an error",
    args: ["name", "startPoint"],
    shorts: { cwd: "C" },
    output: "json",
    effects: ADDS_REF,
  })
  .handler(async (input: GitBranchAddInput, ctx): Promise<GitBranchAddOutput> => gitBranchAdd(input, ctx))
  .build();

const gitBranchDeleteProcedure = createProcedure()
  .path(["git", "branch", "delete"])
  .input(zodAdapter<GitBranchDeleteInput>(GitBranchDeleteInputSchema))
  .output(zodAdapter<GitBranchDeleteOutput>(GitBranchDeleteOutputSchema))
  .meta({
    description: "Delete a branch. With force, also a branch that is not merged",
    args: ["name"],
    shorts: { force: "f", cwd: "C" },
    output: "json",
    // With force, the commits of the branch can be lost
    effects: DELETES,
  })
  .handler(async (input: GitBranchDeleteInput, ctx): Promise<GitBranchDeleteOutput> => gitBranchDelete(input, ctx))
  .build();

// =============================================================================
// Registration
// =============================================================================

/**
 * The module of this package, for `createRegistry()`: its procedures as data. Importing this
 * file registers nothing. (`register.ts` registers the same procedures in the global registry.)
 */
export const gitModule: ProcedureModule = defineModule("@procedures/git", [
    gitStatusProcedure,
    gitAddProcedure,
    gitCommitProcedure,
    gitPushProcedure,
    gitPullProcedure,
    gitCloneProcedure,
    gitCheckoutProcedure,
    gitBranchProcedure,
    gitLogProcedure,
    gitDiffProcedure,
    gitInitProcedure,
    gitRemoteProcedure,
    gitRemoteSetProcedure,
    gitFetchProcedure,
    // Predicate procedures
    gitHasChangesProcedure,
    gitHasStagedChangesProcedure,
    gitHasUnstagedChangesProcedure,
    gitHasUntrackedFilesProcedure,
    gitHasLocalCommitsProcedure,
    gitIsCleanProcedure,
    // Stash procedures
    gitStashListProcedure,
    gitStashPushProcedure,
    gitStashPopProcedure,
    gitStashApplyProcedure,
    gitStashDropProcedure,
    gitStashExportProcedure,
    gitStashImportProcedure,
    // Roadmap R40
    gitShowProcedure,
    gitBlameProcedure,
    gitTagListProcedure,
    gitTagAddProcedure,
    gitTagDeleteProcedure,
    gitRevParseProcedure,
    gitResetProcedure,
    gitRestoreProcedure,
    gitMergeProcedure,
    gitMergeAbortProcedure,
    gitRebaseProcedure,
    gitRebaseContinueProcedure,
    gitRebaseAbortProcedure,
    gitWorktreeListProcedure,
    gitWorktreeAddProcedure,
    gitWorktreeRemoveProcedure,
    gitBranchListProcedure,
    gitBranchAddProcedure,
    gitBranchDeleteProcedure,
  ].map(underARoot));

export default gitModule;

/**
 * This function registers the procedures of @procedures/git, and of the modules that it requires, in
 * a registry. The default is the global registry. Importing this file registers nothing: the
 * `./register` entry starts this function (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */
export function registerGitProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [gitModule]);
}
