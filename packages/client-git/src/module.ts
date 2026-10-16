/**
 * Module (no side effects): the procedures of this package as data, for `createRegistry()`.
 *
 * Procedure Registration for git operations
 *
 * Registers git.* procedures with the client system.
 * This file is referenced by package.json's client.procedures field.
 */

import { createProcedure, zodAdapter, defineModule, type Effects, type ProcedureModule, PROCEDURE_REGISTRY, registerModules, type ProcedureRegistry } from "@procedures/client";
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

// =============================================================================
// Procedure Definitions
// =============================================================================

const gitStatusProcedure = createProcedure()
  .path(["git", "status"])
  .input(zodAdapter<GitStatusInput>(GitStatusInputSchema))
  .output(zodAdapter<GitStatusOutput>(GitStatusOutputSchema))
  .meta({
    description: "Get git status",
    args: [],
    shorts: { cwd: "C", short: "s" },
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
    description: "Branch operations",
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
  ]);

export default gitModule;

/**
 * This function registers the procedures of @procedures/git, and of the modules that it requires, in
 * a registry. The default is the global registry. Importing this file registers nothing: the
 * `./register` entry starts this function (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */
export function registerGitProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY): void {
  registerModules(registry, [gitModule]);
}
