/**
 * Procedure Registration for git operations
 *
 * Registers git.* procedures with the client system.
 * This file is referenced by package.json's client.procedures field.
 */

import { createProcedure, registerProcedures, zodAdapter, outputSchema } from "@mark1russell7/client";
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
import { gitRemote } from "./procedures/git/remote.js";
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
} from "./types.js";

// =============================================================================
// Procedure Definitions
// =============================================================================

const gitStatusProcedure = createProcedure()
  .path(["git", "status"])
  .input(zodAdapter<GitStatusInput>(GitStatusInputSchema))
  .output(outputSchema<GitStatusOutput>())
  .meta({
    description: "Get git status",
    args: [],
    shorts: { cwd: "C", short: "s" },
    output: "json",
  })
  .handler(async (input: GitStatusInput, ctx): Promise<GitStatusOutput> => {
    return gitStatus(input, ctx);
  })
  .build();

const gitAddProcedure = createProcedure()
  .path(["git", "add"])
  .input(zodAdapter<GitAddInput>(GitAddInputSchema))
  .output(outputSchema<GitAddOutput>())
  .meta({
    description: "Stage files",
    args: ["paths"],
    shorts: { all: "A", cwd: "C" },
    output: "json",
  })
  .handler(async (input: GitAddInput, ctx): Promise<GitAddOutput> => {
    return gitAdd(input, ctx);
  })
  .build();

const gitCommitProcedure = createProcedure()
  .path(["git", "commit"])
  .input(zodAdapter<GitCommitInput>(GitCommitInputSchema))
  .output(outputSchema<GitCommitOutput>())
  .meta({
    description: "Create commit",
    args: ["message"],
    shorts: { all: "a", amend: "A", cwd: "C" },
    output: "json",
  })
  .handler(async (input: GitCommitInput, ctx): Promise<GitCommitOutput> => {
    return gitCommit(input, ctx);
  })
  .build();

const gitPushProcedure = createProcedure()
  .path(["git", "push"])
  .input(zodAdapter<GitPushInput>(GitPushInputSchema))
  .output(outputSchema<GitPushOutput>())
  .meta({
    description: "Push to remote",
    args: [],
    shorts: { remote: "r", branch: "b", force: "f", setUpstream: "u", cwd: "C" },
    output: "json",
  })
  .handler(async (input: GitPushInput, ctx): Promise<GitPushOutput> => {
    return gitPush(input, ctx);
  })
  .build();

const gitPullProcedure = createProcedure()
  .path(["git", "pull"])
  .input(zodAdapter<GitPullInput>(GitPullInputSchema))
  .output(outputSchema<GitPullOutput>())
  .meta({
    description: "Pull from remote",
    args: [],
    shorts: { remote: "r", branch: "b", rebase: "R", cwd: "C" },
    output: "json",
  })
  .handler(async (input: GitPullInput, ctx): Promise<GitPullOutput> => {
    return gitPull(input, ctx);
  })
  .build();

const gitCloneProcedure = createProcedure()
  .path(["git", "clone"])
  .input(zodAdapter<GitCloneInput>(GitCloneInputSchema))
  .output(outputSchema<GitCloneOutput>())
  .meta({
    description: "Clone repository",
    args: ["url"],
    shorts: { dest: "d", branch: "b", depth: "D", cwd: "C" },
    output: "json",
  })
  .handler(async (input: GitCloneInput, ctx): Promise<GitCloneOutput> => {
    return gitClone(input, ctx);
  })
  .build();

const gitCheckoutProcedure = createProcedure()
  .path(["git", "checkout"])
  .input(zodAdapter<GitCheckoutInput>(GitCheckoutInputSchema))
  .output(outputSchema<GitCheckoutOutput>())
  .meta({
    description: "Checkout branch or files",
    args: ["ref"],
    shorts: { create: "b", cwd: "C" },
    output: "json",
  })
  .handler(async (input: GitCheckoutInput, ctx): Promise<GitCheckoutOutput> => {
    return gitCheckout(input, ctx);
  })
  .build();

const gitBranchProcedure = createProcedure()
  .path(["git", "branch"])
  .input(zodAdapter<GitBranchInput>(GitBranchInputSchema))
  .output(outputSchema<GitBranchOutput>())
  .meta({
    description: "Branch operations",
    args: ["name"],
    shorts: { delete: "d", list: "l", remote: "r", cwd: "C" },
    output: "json",
  })
  .handler(async (input: GitBranchInput, ctx): Promise<GitBranchOutput> => {
    return gitBranch(input, ctx);
  })
  .build();

const gitLogProcedure = createProcedure()
  .path(["git", "log"])
  .input(zodAdapter<GitLogInput>(GitLogInputSchema))
  .output(outputSchema<GitLogOutput>())
  .meta({
    description: "Show commit log",
    args: [],
    shorts: { count: "n", oneline: "o", ref: "r", cwd: "C" },
    output: "json",
  })
  .handler(async (input: GitLogInput, ctx): Promise<GitLogOutput> => {
    return gitLog(input, ctx);
  })
  .build();

const gitDiffProcedure = createProcedure()
  .path(["git", "diff"])
  .input(zodAdapter<GitDiffInput>(GitDiffInputSchema))
  .output(outputSchema<GitDiffOutput>())
  .meta({
    description: "Show changes",
    args: [],
    shorts: { staged: "s", ref: "r", stat: "S", cwd: "C" },
    output: "json",
  })
  .handler(async (input: GitDiffInput, ctx): Promise<GitDiffOutput> => {
    return gitDiff(input, ctx);
  })
  .build();


const gitInitProcedure = createProcedure()
  .path(["git", "init"])
  .input(zodAdapter<GitInitInput>(GitInitInputSchema))
  .output(outputSchema<GitInitOutput>())
  .meta({
    description: "Initialize a git repository",
    args: [],
    shorts: { cwd: "C", bare: "b", initialBranch: "B" },
    output: "json",
  })
  .handler(async (input: GitInitInput, ctx): Promise<GitInitOutput> => {
    return gitInit(input, ctx);
  })
  .build();

const gitRemoteProcedure = createProcedure()
  .path(["git", "remote"])
  .input(zodAdapter<GitRemoteInput>(GitRemoteInputSchema))
  .output(outputSchema<GitRemoteOutput>())
  .meta({
    description: "Get or set remote URLs",
    args: [],
    shorts: { name: "n", url: "u", cwd: "C" },
    output: "json",
  })
  .handler(async (input: GitRemoteInput, ctx): Promise<GitRemoteOutput> => {
    return gitRemote(input, ctx);
  })
  .build();

const gitFetchProcedure = createProcedure()
  .path(["git", "fetch"])
  .input(zodAdapter<GitFetchInput>(GitFetchInputSchema))
  .output(outputSchema<GitFetchOutput>())
  .meta({
    description: "Fetch from remote",
    args: [],
    shorts: { remote: "r", branch: "b", all: "a", prune: "p", cwd: "C" },
    output: "json",
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
  .output(outputSchema<GitPredicateOutput>())
  .meta({
    description: "Check if there are any changes (unstaged, staged, or untracked)",
    args: [],
    shorts: { cwd: "C" },
    output: "json",
  })
  .handler(async (input: GitPredicateInput, ctx): Promise<GitPredicateOutput> => {
    return gitHasChanges(input, ctx);
  })
  .build();

const gitHasStagedChangesProcedure = createProcedure()
  .path(["git", "hasStagedChanges"])
  .input(zodAdapter<GitPredicateInput>(GitPredicateInputSchema))
  .output(outputSchema<GitPredicateOutput>())
  .meta({
    description: "Check if there are any staged changes ready to commit",
    args: [],
    shorts: { cwd: "C" },
    output: "json",
  })
  .handler(async (input: GitPredicateInput, ctx): Promise<GitPredicateOutput> => {
    return gitHasStagedChanges(input, ctx);
  })
  .build();

const gitHasUnstagedChangesProcedure = createProcedure()
  .path(["git", "hasUnstagedChanges"])
  .input(zodAdapter<GitPredicateInput>(GitPredicateInputSchema))
  .output(outputSchema<GitPredicateOutput>())
  .meta({
    description: "Check if there are any unstaged changes",
    args: [],
    shorts: { cwd: "C" },
    output: "json",
  })
  .handler(async (input: GitPredicateInput, ctx): Promise<GitPredicateOutput> => {
    return gitHasUnstagedChanges(input, ctx);
  })
  .build();

const gitHasUntrackedFilesProcedure = createProcedure()
  .path(["git", "hasUntrackedFiles"])
  .input(zodAdapter<GitPredicateInput>(GitPredicateInputSchema))
  .output(outputSchema<GitPredicateOutput>())
  .meta({
    description: "Check if there are any untracked files",
    args: [],
    shorts: { cwd: "C" },
    output: "json",
  })
  .handler(async (input: GitPredicateInput, ctx): Promise<GitPredicateOutput> => {
    return gitHasUntrackedFiles(input, ctx);
  })
  .build();

const gitHasLocalCommitsProcedure = createProcedure()
  .path(["git", "hasLocalCommits"])
  .input(zodAdapter<GitPredicateInput>(GitPredicateInputSchema))
  .output(outputSchema<GitPredicateOutput>())
  .meta({
    description: "Check if there are local commits that haven't been pushed",
    args: [],
    shorts: { cwd: "C" },
    output: "json",
  })
  .handler(async (input: GitPredicateInput, ctx): Promise<GitPredicateOutput> => {
    return gitHasLocalCommits(input, ctx);
  })
  .build();

const gitIsCleanProcedure = createProcedure()
  .path(["git", "isClean"])
  .input(zodAdapter<GitPredicateInput>(GitPredicateInputSchema))
  .output(outputSchema<GitPredicateOutput>())
  .meta({
    description: "Check if the working directory is clean",
    args: [],
    shorts: { cwd: "C" },
    output: "json",
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
  .output(outputSchema<GitStashListOutput>())
  .meta({
    description: "List all stashes",
    args: [],
    shorts: { cwd: "C" },
    output: "json",
  })
  .handler(async (input: GitStashListInput, ctx): Promise<GitStashListOutput> => {
    return gitStashList(input, ctx);
  })
  .build();

const gitStashPushProcedure = createProcedure()
  .path(["git", "stash", "push"])
  .input(zodAdapter<GitStashPushInput>(GitStashPushInputSchema))
  .output(outputSchema<GitStashPushOutput>())
  .meta({
    description: "Push changes to stash",
    args: ["message"],
    shorts: { message: "m", includeUntracked: "u", keepIndex: "k", cwd: "C" },
    output: "json",
  })
  .handler(async (input: GitStashPushInput, ctx): Promise<GitStashPushOutput> => {
    return gitStashPush(input, ctx);
  })
  .build();

const gitStashPopProcedure = createProcedure()
  .path(["git", "stash", "pop"])
  .input(zodAdapter<GitStashPopInput>(GitStashPopInputSchema))
  .output(outputSchema<GitStashPopOutput>())
  .meta({
    description: "Pop stash (apply and remove)",
    args: [],
    shorts: { index: "n", cwd: "C" },
    output: "json",
  })
  .handler(async (input: GitStashPopInput, ctx): Promise<GitStashPopOutput> => {
    return gitStashPop(input, ctx);
  })
  .build();

const gitStashApplyProcedure = createProcedure()
  .path(["git", "stash", "apply"])
  .input(zodAdapter<GitStashApplyInput>(GitStashApplyInputSchema))
  .output(outputSchema<GitStashApplyOutput>())
  .meta({
    description: "Apply stash without removing",
    args: [],
    shorts: { index: "n", cwd: "C" },
    output: "json",
  })
  .handler(async (input: GitStashApplyInput, ctx): Promise<GitStashApplyOutput> => {
    return gitStashApply(input, ctx);
  })
  .build();

const gitStashDropProcedure = createProcedure()
  .path(["git", "stash", "drop"])
  .input(zodAdapter<GitStashDropInput>(GitStashDropInputSchema))
  .output(outputSchema<GitStashDropOutput>())
  .meta({
    description: "Drop a stash",
    args: [],
    shorts: { index: "n", cwd: "C" },
    output: "json",
  })
  .handler(async (input: GitStashDropInput, ctx): Promise<GitStashDropOutput> => {
    return gitStashDrop(input, ctx);
  })
  .build();

const gitStashExportProcedure = createProcedure()
  .path(["git", "stash", "export"])
  .input(zodAdapter<GitStashExportInput>(GitStashExportInputSchema))
  .output(outputSchema<GitStashExportOutput>())
  .meta({
    description: "Export stash as patch for snapshot storage",
    args: [],
    shorts: { index: "n", cwd: "C" },
    output: "json",
  })
  .handler(async (input: GitStashExportInput, ctx): Promise<GitStashExportOutput> => {
    return gitStashExport(input, ctx);
  })
  .build();

const gitStashImportProcedure = createProcedure()
  .path(["git", "stash", "import"])
  .input(zodAdapter<GitStashImportInput>(GitStashImportInputSchema))
  .output(outputSchema<GitStashImportOutput>())
  .meta({
    description: "Import stash from patch",
    args: ["patch"],
    shorts: { message: "m", includeUntracked: "u", cwd: "C" },
    output: "json",
  })
  .handler(async (input: GitStashImportInput, ctx): Promise<GitStashImportOutput> => {
    return gitStashImport(input, ctx);
  })
  .build();

// =============================================================================
// Registration
// =============================================================================

export function registerGitProcedures(): void {
  registerProcedures([
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
}

// Auto-register when this module is loaded
registerGitProcedures();
