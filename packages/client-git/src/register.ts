/**
 * Procedure Registration for git operations
 *
 * Registers git.* procedures with the client system.
 * This file is referenced by package.json's client.procedures field.
 */

import { createProcedure, registerProcedures } from "@mark1russell7/client";
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
} from "./types.js";

// =============================================================================
// Minimal Schema Adapter (wraps Zod for client procedure system)
// =============================================================================

interface ZodErrorLike {
  message: string;
  errors: Array<{ path: (string | number)[]; message: string }>;
}

interface ZodLikeSchema<T> {
  parse(data: unknown): T;
  safeParse(
    data: unknown
  ): { success: true; data: T } | { success: false; error: ZodErrorLike };
  _output: T;
}

function zodAdapter<T>(schema: { parse: (data: unknown) => T }): ZodLikeSchema<T> {
  return {
    parse: (data: unknown) => schema.parse(data),
    safeParse: (data: unknown) => {
      try {
        const parsed = schema.parse(data);
        return { success: true as const, data: parsed };
      } catch (error) {
        const err = error as { message?: string; errors?: unknown[] };
        return {
          success: false as const,
          error: {
            message: err.message ?? "Validation failed",
            errors: Array.isArray(err.errors)
              ? err.errors.map((e: unknown) => {
                  const errObj = e as { path?: unknown[]; message?: string };
                  return {
                    path: (errObj.path ?? []) as (string | number)[],
                    message: errObj.message ?? "Unknown error",
                  };
                })
              : [],
          },
        };
      }
    },
    _output: undefined as unknown as T,
  };
}

function outputSchema<T>(): ZodLikeSchema<T> {
  return {
    parse: (data: unknown) => data as T,
    safeParse: (data: unknown) => ({ success: true as const, data: data as T }),
    _output: undefined as unknown as T,
  };
}

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
  .handler(async (input: GitStatusInput): Promise<GitStatusOutput> => {
    return gitStatus(input);
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
  .handler(async (input: GitAddInput): Promise<GitAddOutput> => {
    return gitAdd(input);
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
  .handler(async (input: GitCommitInput): Promise<GitCommitOutput> => {
    return gitCommit(input);
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
  .handler(async (input: GitPushInput): Promise<GitPushOutput> => {
    return gitPush(input);
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
  .handler(async (input: GitPullInput): Promise<GitPullOutput> => {
    return gitPull(input);
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
  .handler(async (input: GitCloneInput): Promise<GitCloneOutput> => {
    return gitClone(input);
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
  .handler(async (input: GitCheckoutInput): Promise<GitCheckoutOutput> => {
    return gitCheckout(input);
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
  .handler(async (input: GitBranchInput): Promise<GitBranchOutput> => {
    return gitBranch(input);
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
  .handler(async (input: GitLogInput): Promise<GitLogOutput> => {
    return gitLog(input);
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
  .handler(async (input: GitDiffInput): Promise<GitDiffOutput> => {
    return gitDiff(input);
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
  ]);
}

// Auto-register when this module is loaded
registerGitProcedures();
