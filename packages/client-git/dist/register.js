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
import { GitStatusInputSchema, GitAddInputSchema, GitCommitInputSchema, GitPushInputSchema, GitPullInputSchema, GitCloneInputSchema, GitCheckoutInputSchema, GitBranchInputSchema, GitLogInputSchema, GitDiffInputSchema, } from "./types.js";
function zodAdapter(schema) {
    return {
        parse: (data) => schema.parse(data),
        safeParse: (data) => {
            try {
                const parsed = schema.parse(data);
                return { success: true, data: parsed };
            }
            catch (error) {
                const err = error;
                return {
                    success: false,
                    error: {
                        message: err.message ?? "Validation failed",
                        errors: Array.isArray(err.errors)
                            ? err.errors.map((e) => {
                                const errObj = e;
                                return {
                                    path: (errObj.path ?? []),
                                    message: errObj.message ?? "Unknown error",
                                };
                            })
                            : [],
                    },
                };
            }
        },
        _output: undefined,
    };
}
function outputSchema() {
    return {
        parse: (data) => data,
        safeParse: (data) => ({ success: true, data: data }),
        _output: undefined,
    };
}
// =============================================================================
// Procedure Definitions
// =============================================================================
const gitStatusProcedure = createProcedure()
    .path(["git", "status"])
    .input(zodAdapter(GitStatusInputSchema))
    .output(outputSchema())
    .meta({
    description: "Get git status",
    args: [],
    shorts: { cwd: "C", short: "s" },
    output: "json",
})
    .handler(async (input) => {
    return gitStatus(input);
})
    .build();
const gitAddProcedure = createProcedure()
    .path(["git", "add"])
    .input(zodAdapter(GitAddInputSchema))
    .output(outputSchema())
    .meta({
    description: "Stage files",
    args: ["paths"],
    shorts: { all: "A", cwd: "C" },
    output: "json",
})
    .handler(async (input) => {
    return gitAdd(input);
})
    .build();
const gitCommitProcedure = createProcedure()
    .path(["git", "commit"])
    .input(zodAdapter(GitCommitInputSchema))
    .output(outputSchema())
    .meta({
    description: "Create commit",
    args: ["message"],
    shorts: { all: "a", amend: "A", cwd: "C" },
    output: "json",
})
    .handler(async (input) => {
    return gitCommit(input);
})
    .build();
const gitPushProcedure = createProcedure()
    .path(["git", "push"])
    .input(zodAdapter(GitPushInputSchema))
    .output(outputSchema())
    .meta({
    description: "Push to remote",
    args: [],
    shorts: { remote: "r", branch: "b", force: "f", setUpstream: "u", cwd: "C" },
    output: "json",
})
    .handler(async (input) => {
    return gitPush(input);
})
    .build();
const gitPullProcedure = createProcedure()
    .path(["git", "pull"])
    .input(zodAdapter(GitPullInputSchema))
    .output(outputSchema())
    .meta({
    description: "Pull from remote",
    args: [],
    shorts: { remote: "r", branch: "b", rebase: "R", cwd: "C" },
    output: "json",
})
    .handler(async (input) => {
    return gitPull(input);
})
    .build();
const gitCloneProcedure = createProcedure()
    .path(["git", "clone"])
    .input(zodAdapter(GitCloneInputSchema))
    .output(outputSchema())
    .meta({
    description: "Clone repository",
    args: ["url"],
    shorts: { dest: "d", branch: "b", depth: "D", cwd: "C" },
    output: "json",
})
    .handler(async (input) => {
    return gitClone(input);
})
    .build();
const gitCheckoutProcedure = createProcedure()
    .path(["git", "checkout"])
    .input(zodAdapter(GitCheckoutInputSchema))
    .output(outputSchema())
    .meta({
    description: "Checkout branch or files",
    args: ["ref"],
    shorts: { create: "b", cwd: "C" },
    output: "json",
})
    .handler(async (input) => {
    return gitCheckout(input);
})
    .build();
const gitBranchProcedure = createProcedure()
    .path(["git", "branch"])
    .input(zodAdapter(GitBranchInputSchema))
    .output(outputSchema())
    .meta({
    description: "Branch operations",
    args: ["name"],
    shorts: { delete: "d", list: "l", remote: "r", cwd: "C" },
    output: "json",
})
    .handler(async (input) => {
    return gitBranch(input);
})
    .build();
const gitLogProcedure = createProcedure()
    .path(["git", "log"])
    .input(zodAdapter(GitLogInputSchema))
    .output(outputSchema())
    .meta({
    description: "Show commit log",
    args: [],
    shorts: { count: "n", oneline: "o", ref: "r", cwd: "C" },
    output: "json",
})
    .handler(async (input) => {
    return gitLog(input);
})
    .build();
const gitDiffProcedure = createProcedure()
    .path(["git", "diff"])
    .input(zodAdapter(GitDiffInputSchema))
    .output(outputSchema())
    .meta({
    description: "Show changes",
    args: [],
    shorts: { staged: "s", ref: "r", stat: "S", cwd: "C" },
    output: "json",
})
    .handler(async (input) => {
    return gitDiff(input);
})
    .build();
// =============================================================================
// Registration
// =============================================================================
export function registerGitProcedures() {
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
//# sourceMappingURL=register.js.map